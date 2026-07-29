"""Armador de set: ordena tracks siguiendo una curva de energia,
respetando compatibilidad armonica (Camelot) y transiciones de BPM suaves.

Version greedy: en cada paso, entre los candidatos compatibles, elige el que
mejor matchea la energia objetivo de esa posicion. Simple y ya da sets usables.
Despues se puede modelar como grafo + beam search para optimizar la curva completa.
"""
from .camelot import is_compatible
from .db import get_conn


def load_pool():
    """Trae los tracks que tienen camelot, bpm y energy_score cargados.

    Usa un solo representante por grupo de duplicados (is_representative). Si todavia
    no se corrio 'dedupe' (is_representative NULL), no filtra nada: se comporta como antes.
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.track_id, t.title, t.artist, t.bpm, t.camelot, f.energy_score
        FROM dbo.tracks t
        JOIN dbo.track_features f ON f.track_id = t.track_id
        WHERE t.camelot IS NOT NULL AND t.bpm IS NOT NULL
              AND f.energy_score IS NOT NULL
              AND (t.is_representative = 1 OR t.is_representative IS NULL)
    """)
    pool = [dict(track_id=r[0], title=r[1], artist=r[2], bpm=float(r[3]),
                 camelot=r[4], energy=float(r[5])) for r in cur.fetchall()]
    conn.close()
    return pool


def target_curve(n, peak_pos=0.7, start=2.0, peak=9.0, end=4.0):
    """Curva de energia objetivo (1..10): sube hasta el pico y despues baja."""
    curve = []
    peak_i = max(1, int(n * peak_pos))
    for i in range(n):
        if i <= peak_i:
            curve.append(start + (peak - start) * (i / peak_i))
        else:
            curve.append(peak + (end - peak) * ((i - peak_i) / max(1, n - 1 - peak_i)))
    return curve


def build(length=15, bpm_tol=0.06, peak_pos=0.7, energy_boost=False, start_track_id=None):
    """Construye un set de `length` tracks. bpm_tol es la tolerancia relativa de BPM (0.06 = 6%)."""
    pool = load_pool()
    if len(pool) < length:
        length = len(pool)
    if not pool:
        print("Pool vacio. Necesitas ingest + analyze + recompute-energy primero.")
        return []

    curve = target_curve(length, peak_pos=peak_pos)
    used = set()

    # Track inicial: el pedido, o el mas cercano a la energia inicial de la curva
    if start_track_id is not None:
        current = next((t for t in pool if t["track_id"] == start_track_id), None)
    else:
        current = min(pool, key=lambda t: abs(t["energy"] - curve[0]))
    if current is None:
        print("No encontre el track inicial.")
        return []

    order = [current]
    used.add(current["track_id"])

    for i in range(1, length):
        target = curve[i]
        candidates = []
        for t in pool:
            if t["track_id"] in used:
                continue
            harmonic = is_compatible(current["camelot"], t["camelot"], energy_boost)
            bpm_ok = abs(t["bpm"] - current["bpm"]) <= current["bpm"] * bpm_tol
            if harmonic and bpm_ok:
                candidates.append(t)

        # si no hay nada compatible, relajamos el BPM (mantenemos armonia)
        if not candidates:
            candidates = [t for t in pool if t["track_id"] not in used
                          and is_compatible(current["camelot"], t["camelot"], energy_boost)]
        # si sigue sin haber, relajamos todo y seguimos la curva
        if not candidates:
            candidates = [t for t in pool if t["track_id"] not in used]
        if not candidates:
            break

        nxt = min(candidates, key=lambda t: abs(t["energy"] - target))
        order.append(nxt)
        used.add(nxt["track_id"])
        current = nxt

    return order


def print_set(order):
    print(f"\n{'#':>2}  {'BPM':>5}  {'KEY':>4}  {'E':>4}  TITULO - ARTISTA")
    print("-" * 60)
    for i, t in enumerate(order, 1):
        print(f"{i:>2}  {t['bpm']:>5.1f}  {t['camelot']:>4}  {t['energy']:>4.1f}  "
              f"{t['title']} - {t['artist']}")


def save_set(order, name):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO dbo.sets (name) OUTPUT INSERTED.set_id VALUES (?)", name)
    set_id = cur.fetchone()[0]
    for pos, t in enumerate(order, 1):
        cur.execute("INSERT INTO dbo.set_tracks (set_id, position, track_id) VALUES (?,?,?)",
                    set_id, pos, t["track_id"])
    conn.commit()
    conn.close()
    print(f"Set '{name}' guardado (set_id={set_id}).")
    return set_id
