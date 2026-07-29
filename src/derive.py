"""Campos derivados del file_path: 'quality' (por extension) y 'collection' (por carpeta).

Invariante: SOLO se lee el string del path. No se abre, mueve ni toca ningun archivo.
Degradacion con gracia: sin path -> quality NULL; carpeta indeterminada -> collection NULL.

Uso por CLI:
    python -m src.cli derive-fields            # rellena quality/collection en los tracks cargados
    python -m src.cli derive-fields --report   # ademas cuenta cuantos hay por quality y collection
"""
import os
from collections import Counter

from .db import get_conn

# Extensiones lossless. FLAC es lossless de verdad, va aca (el resto -> 'compressed').
_LOSSLESS_EXT = {".aiff", ".aif", ".wav", ".flac"}

# Mapeo carpeta -> coleccion (semantico: Maxi guarda en AIFF, Zoe en Soulseek).
# Se compara contra los segmentos de directorio del path (case-insensitive).
_COLLECTION_BY_FOLDER = {
    "aiff": "Maxi",
    "soulseek": "Zoe",
}


def quality_of(path):
    """'lossless' (.aiff/.wav/.flac), 'compressed' (.mp3/.m4a/otros) o None si no hay path."""
    if not path:
        return None
    ext = os.path.splitext(str(path))[1].lower()
    return "lossless" if ext in _LOSSLESS_EXT else "compressed"


def _dir_segments(path):
    """Segmentos de directorio del path (sin el nombre del archivo), en minusculas."""
    p = str(path).replace("\\", "/")
    parts = [seg for seg in p.split("/") if seg]
    return [seg.lower() for seg in parts[:-1]]  # descarta el archivo (ultimo segmento)


def collection_of(path):
    """'Maxi'/'Zoe' segun la carpeta de la ruta, o None si no se puede determinar."""
    if not path:
        return None
    for seg in _dir_segments(path):
        if seg in _COLLECTION_BY_FOLDER:
            return _COLLECTION_BY_FOLDER[seg]
    return None


def _report(rows):
    """Imprime conteos por quality y por collection. `rows` es lista de (quality, collection)."""
    q = Counter(qc[0] if qc[0] is not None else "(null)" for qc in rows)
    c = Counter(qc[1] if qc[1] is not None else "(null)" for qc in rows)
    print(f"\nTotal: {len(rows)} tracks")
    print("Por quality:")
    for k, v in sorted(q.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {k:<12} {v:>4}")
    print("Por collection:")
    for k, v in sorted(c.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {k:<12} {v:>4}")


def backfill(report=False):
    """Recalcula quality/collection desde file_path para todos los tracks y hace UPDATE."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT track_id, file_path FROM dbo.tracks")
    todo = [(r[0], r[1]) for r in cur.fetchall()]

    computed = []
    for track_id, path in todo:
        q = quality_of(path)
        c = collection_of(path)
        cur.execute("UPDATE dbo.tracks SET quality=?, collection=? WHERE track_id=?",
                    q, c, track_id)
        computed.append((q, c))
    conn.commit()
    conn.close()

    print(f"Campos derivados actualizados en {len(computed)} tracks.")
    if report:
        _report(computed)
    return len(computed)
