"""Analisis de audio con librosa: extrae features de cada AIFF y arma el score de energia 1..10.

Este es el diferencial del proyecto: como Spotify dio de baja audio-features (nov 2024) y tu
audio es local, la intensidad/groove la calculamos nosotros, offline y gratis.

Flujo:
  1) analyze()               -> features crudos por track  (paso caro, corre una vez)
  2) recompute_energy_scores() -> normaliza sobre toda la biblioteca -> energy_score 1..10
"""
import numpy as np
import librosa

from .db import get_conn

# Pesos para combinar los features en el score final (ajustalos a oido).
WEIGHTS = {
    "rms_energy": 0.30,
    "onset_rate": 0.25,
    "low_band_ratio": 0.20,
    "pulse_clarity": 0.15,
    "spectral_centroid": 0.10,
}


def extract_features(file_path, sr=22050):
    """Devuelve un dict de features crudos, o None si el archivo no se puede leer."""
    y, sr = librosa.load(file_path, sr=sr, mono=True)
    if y.size == 0:
        return None
    duration = librosa.get_duration(y=y, sr=sr) or 1.0

    rms = float(np.mean(librosa.feature.rms(y=y)))
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
    onset_rate = len(onsets) / duration

    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    low = float(S[freqs < 200].sum())
    total = float(S.sum()) + 1e-9
    low_band_ratio = low / total

    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
    pulse_clarity = float(np.mean(np.max(tempogram, axis=0)))

    return {
        "rms_energy": rms,
        "spectral_centroid": centroid,
        "onset_rate": onset_rate,
        "low_band_ratio": low_band_ratio,
        "pulse_clarity": pulse_clarity,
    }


_UPSERT_FEATURES = """
MERGE dbo.track_features AS t
USING (SELECT ? AS track_id) AS s
ON t.track_id = s.track_id
WHEN MATCHED THEN UPDATE SET
    rms_energy=?, spectral_centroid=?, onset_rate=?, low_band_ratio=?,
    pulse_clarity=?, analyzed_at=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
    (track_id, rms_energy, spectral_centroid, onset_rate, low_band_ratio, pulse_clarity)
    VALUES (?,?,?,?,?,?);
"""


def analyze(only_missing=True):
    """Analiza los tracks que tienen file_path. Si only_missing, saltea los ya analizados."""
    conn = get_conn()
    cur = conn.cursor()
    if only_missing:
        cur.execute("""
            SELECT t.track_id, t.file_path FROM dbo.tracks t
            LEFT JOIN dbo.track_features f ON f.track_id = t.track_id
            WHERE t.file_path IS NOT NULL AND f.track_id IS NULL
        """)
    else:
        cur.execute("SELECT track_id, file_path FROM dbo.tracks WHERE file_path IS NOT NULL")
    todo = cur.fetchall()

    done = 0
    for track_id, path in todo:
        try:
            feats = extract_features(path)
        except Exception as e:  # noqa: BLE001 - queremos seguir con el resto
            print(f"  [skip] {track_id}: {e}")
            continue
        if not feats:
            continue
        cur.execute(_UPSERT_FEATURES,
            track_id,
            feats["rms_energy"], feats["spectral_centroid"], feats["onset_rate"],
            feats["low_band_ratio"], feats["pulse_clarity"],
            track_id,
            feats["rms_energy"], feats["spectral_centroid"], feats["onset_rate"],
            feats["low_band_ratio"], feats["pulse_clarity"],
        )
        conn.commit()
        done += 1
        print(f"  [{done}/{len(todo)}] analizado track {track_id}")
    conn.close()
    print(f"Analizados {done} tracks.")
    return done


def _minmax(values):
    lo, hi = min(values), max(values)
    rng = hi - lo
    if rng == 0:
        return [0.5 for _ in values]
    return [(v - lo) / rng for v in values]


def recompute_energy_scores():
    """Normaliza cada feature sobre toda la biblioteca y combina -> energy_score en 1..10."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT track_id, rms_energy, spectral_centroid, onset_rate,
               low_band_ratio, pulse_clarity
        FROM dbo.track_features
    """)
    rows = cur.fetchall()
    if not rows:
        print("No hay features todavia. Corre 'analyze' primero.")
        return 0

    ids = [r[0] for r in rows]
    cols = {
        "rms_energy": _minmax([r[1] for r in rows]),
        "spectral_centroid": _minmax([r[2] for r in rows]),
        "onset_rate": _minmax([r[3] for r in rows]),
        "low_band_ratio": _minmax([r[4] for r in rows]),
        "pulse_clarity": _minmax([r[5] for r in rows]),
    }

    for i, track_id in enumerate(ids):
        combined = sum(WEIGHTS[name] * cols[name][i] for name in WEIGHTS)
        score = round(1 + combined * 9, 2)  # escala 1..10
        cur.execute("UPDATE dbo.track_features SET energy_score=? WHERE track_id=?",
                    score, track_id)
    conn.commit()
    conn.close()
    print(f"Recalculado energy_score para {len(ids)} tracks.")
    return len(ids)
