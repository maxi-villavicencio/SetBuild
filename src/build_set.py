"""Armador de set: ordena tracks siguiendo una curva de energia,
respetando compatibilidad armonica (Camelot) y transiciones de BPM suaves.

Version greedy: en cada paso, entre los candidatos compatibles, elige el que
mejor matchea la energia objetivo de esa posicion. Simple y ya da sets usables.
Despues se puede modelar como grafo + beam search para optimizar la curva completa.
"""
from .camelot import harmonic_relation, is_compatible
from .db import get_conn
from .genres import is_genre_compatible
from .library import get_track, get_tracks


def _bpm_ok(bpm_a, bpm_b, tol):
    """True si `bpm_b` esta dentro de la tolerancia relativa de `bpm_a` (tol=0.06 => 6%)."""
    if bpm_a is None or bpm_b is None:
        return False
    return abs(bpm_b - bpm_a) <= bpm_a * tol


def _resolve_filters(mode, quality, collection):
    """Resuelve los filtros efectivos (quality, collection) a partir del modo y los overrides.

    El modo fija los defaults; los flags sueltos pisan por dimension:
      - limpio   -> quality=lossless, collection=Maxi (tu material curado)
      - realista -> sin filtro (None), tolera datos faltantes (degradacion con gracia)
    """
    if mode == "limpio":
        eff_q, eff_c = "lossless", "Maxi"
    else:  # realista
        eff_q, eff_c = None, None
    if quality is not None:
        eff_q = quality
    if collection is not None:
        eff_c = collection
    return eff_q, eff_c


def load_pool(quality=None, collection=None):
    """Trae los tracks que tienen camelot, bpm y energy_score cargados.

    Usa un solo representante por grupo de duplicados (is_representative). Si todavia
    no se corrio 'dedupe' (is_representative NULL), no filtra nada: se comporta como antes.
    Los filtros quality/collection son opcionales; si son None no filtran esa dimension
    (asi los tracks con quality/collection nulos entran igual: degradacion con gracia).
    """
    where = ["t.camelot IS NOT NULL", "t.bpm IS NOT NULL", "f.energy_score IS NOT NULL",
             "(t.is_representative = 1 OR t.is_representative IS NULL)"]
    params = []
    if quality is not None:
        where.append("t.quality = ?")
        params.append(quality)
    if collection is not None:
        where.append("t.collection = ?")
        params.append(collection)

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.track_id, t.title, t.artist, t.bpm, t.camelot, f.energy_score
        FROM dbo.tracks t
        JOIN dbo.track_features f ON f.track_id = t.track_id
        WHERE """ + " AND ".join(where), *params)
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


def build(length=15, bpm_tol=0.06, peak_pos=0.7, energy_boost=False, start_track_id=None,
          mode="limpio", quality=None, collection=None):
    """Construye un set de `length` tracks. bpm_tol es la tolerancia relativa de BPM (0.06 = 6%).

    mode: "limpio" (solo lossless de Maxi) o "realista" (todo). quality/collection son
    overrides opcionales que pisan el modo por dimension.
    """
    eff_q, eff_c = _resolve_filters(mode, quality, collection)
    pool = load_pool(quality=eff_q, collection=eff_c)
    print(f"Modo: {mode} (quality={eff_q or 'cualquiera'}, collection={eff_c or 'cualquiera'}) "
          f"— pool: {len(pool)} tracks")
    if len(pool) < length:
        length = len(pool)
    if not pool:
        print("Pool vacio. Revisa el modo/filtros, o corre ingest + analyze + recompute-energy.")
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
            bpm_ok = _bpm_ok(current["bpm"], t["bpm"], bpm_tol)
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


# --- Sugeridor interactivo (Fase 3): dado un track actual, mejores candidatos ---
#
# Jerarquia (Sprint 11):
#   Filtros DUROS (no cumplen -> no aparecen): BPM +/-2 absoluto; Camelot compatible
#     (misma / +-1 / relativo, reusando camelot.py; +7 solo con energy_boost).
#   Ranking: 1) genero (mismo -> compatible -> sin genero), 2) energia, 3) BPM.
#   Degradacion con gracia: sin genero = compatible con todo; sin camelot/BPM pasa pero
#     despriorizado; sin energia se hunde por distancia. Nada rompe.

_ENERGY_SIMILAR = 0.75  # margen para considerar la energia "similar" al objetivo
_BPM_HARD = 2.0         # filtro duro de BPM: +/-2 absoluto respecto del track actual
_ENERGY_GRAIN = 0.5     # grano para agrupar la energia en niveles (desempate seguras vs +7)

# Transiciones armonicas "seguras" (vs el energy boost +7, que es mas audaz).
_SAFE_KEYS = {"misma key", "key adyacente (+1)", "key adyacente (-1)", "relativo mayor/menor"}

# Campos del candidato que se devuelven (subconjunto de los del track).
_CAND_FIELDS = ("track_id", "title", "artist", "bpm", "camelot",
                "energy_score", "quality", "collection", "genre_canonical", "duration_sec")


def _bpm_check(cur_bpm, cand_bpm):
    """Filtro duro de BPM. Devuelve (status, distancia, motivo).
    status: 'ok' | 'exclude' | 'gracia' (dato faltante: pasa pero despriorizado)."""
    if cur_bpm is None or cand_bpm is None:
        return "gracia", 99.0, "sin BPM"
    dist = abs(cand_bpm - cur_bpm)
    if dist > _BPM_HARD:
        return "exclude", dist, None
    return "ok", dist, None


def _key_check(cur_cam, cand_cam):
    """Filtro duro de Camelot (reusa harmonic_relation con +7 SIEMPRE habilitado en el sugeridor).
    Devuelve (status, motivo). status: 'ok' (motivo=relacion) | 'exclude' | 'gracia' (sin key)."""
    if not cur_cam or not cand_cam:
        return "gracia", "sin key"
    rel = harmonic_relation(cur_cam, cand_cam, energy_boost=True)
    if rel is None:
        return "exclude", None
    return "ok", rel


def _genre_rank(cur_genre, cand_genre):
    """Ranking de genero. Devuelve (rank, motivo) o (None, None) si es incompatible (excluir).
    0 = mismo genero, 1 = genero compatible, 2 = sin genero (None, al final del bloque)."""
    if cand_genre is None:
        return 2, "sin genero"
    if cur_genre is not None and cand_genre == cur_genre:
        return 0, "mismo genero"
    if is_genre_compatible(cur_genre, cand_genre):
        return 1, "genero compatible"
    return None, None  # genero no compatible -> excluir


def _energy_reason(cand_e, target):
    """(distancia, motivo) segun la energia del candidato vs el objetivo."""
    if cand_e is None:
        return 99.0, "sin energia"
    if target is None:
        return 0.0, None
    diff = cand_e - target
    if abs(diff) <= _ENERGY_SIMILAR:
        return abs(diff), "energia similar"
    return abs(diff), ("mas movido" if diff > 0 else "mas tranqui")


def next_candidates(current, pool, target_energy=None, limit=6):
    """Dado un track actual, devuelve los mejores candidatos del pool (dicts estilo library).

    Filtros duros: BPM +/-2 y Camelot compatible (misma/+-1/relativo/+7, reusa camelot.py con
    el energy boost SIEMPRE habilitado en el sugeridor). Ranking:
      genero -> (datos completos) -> nivel de energia -> transicion segura antes que +7 ->
      energia fina -> BPM.
    El +7 (energy boost) suma opciones pero no se pone arriba de una mezcla segura de energia
    equivalente. Degradacion con gracia: None de genero nunca excluye; sin camelot/BPM pasa
    despriorizado; sin energia se hunde por distancia.
    """
    cur_cam = current.get("camelot")
    cur_bpm = current.get("bpm")
    cur_genre = current.get("genre_canonical")
    target = target_energy if target_energy is not None else current.get("energy_score")

    scored = []
    for t in pool:
        if t["track_id"] == current["track_id"]:
            continue

        bpm_status, bpm_dist, bpm_reason = _bpm_check(cur_bpm, t.get("bpm"))
        if bpm_status == "exclude":
            continue
        key_status, key_reason = _key_check(cur_cam, t.get("camelot"))
        if key_status == "exclude":
            continue
        g_rank, g_reason = _genre_rank(cur_genre, t.get("genre_canonical"))
        if g_rank is None:
            continue  # genero no compatible

        e_dist, e_reason = _energy_reason(t.get("energy_score"), target)
        incompleto = 1 if (key_status == "gracia" or bpm_status == "gracia") else 0
        e_level = round(e_dist / _ENERGY_GRAIN) * _ENERGY_GRAIN  # agrupa energia en niveles
        boost_flag = 0 if key_reason in _SAFE_KEYS else 1        # seguras (0) antes que +7 (1)

        reasons = [r for r in (g_reason, key_reason, e_reason, bpm_reason) if r]
        cand = {k: t.get(k) for k in _CAND_FIELDS}
        cand["reasons"] = reasons
        # orden: genero -> completo -> nivel de energia -> segura antes que +7 -> energia fina -> BPM
        scored.append(((g_rank, incompleto, e_level, boost_flag, e_dist, bpm_dist), cand))

    scored.sort(key=lambda x: x[0])
    return [cand for _, cand in scored[:limit]]


def suggest_next(track_id, limit=6, target_energy=None, mode="realista",
                 quality=None, collection=None):
    """Orquesta el sugeridor: trae el track actual y el pool (representantes, filtrado por modo)
    y devuelve {"current", "candidates"}. Devuelve None si el track_id no existe."""
    current = get_track(track_id)
    if current is None:
        return None
    eff_q, eff_c = _resolve_filters(mode, quality, collection)
    pool = get_tracks(quality=eff_q, collection=eff_c, only_representatives=True)
    cands = next_candidates(current, pool, target_energy=target_energy, limit=limit)
    return {"current": current, "candidates": cands}


def print_candidates(result):
    """Imprime la salida de suggest_next para probar por CLI."""
    if result is None:
        print("No existe ese track_id.")
        return
    c = result["current"]
    e = f"{c['energy_score']:.1f}" if c.get("energy_score") is not None else "?"
    bpm = f"{c['bpm']:.1f}" if c.get("bpm") is not None else "?"
    print(f"\nActual: [{c['track_id']}] {c['title']} - {c['artist']}")
    print(f"        {bpm} BPM | {c.get('camelot') or '?'} | energia {e} "
          f"| genero {c.get('genre_canonical') or '-'}")
    if not result["candidates"]:
        print("\nSin candidatos compatibles - carga mas tracks de este genero "
              "o cambia el track anterior.")
        return
    print(f"\n{'BPM':>5}  {'KEY':>4}  {'E':>4}  MOTIVOS / TITULO - ARTISTA")
    print("-" * 78)
    for t in result["candidates"]:
        e = f"{t['energy_score']:.1f}" if t.get("energy_score") is not None else "  ?"
        bpm = f"{t['bpm']:.1f}" if t.get("bpm") is not None else "  ?"
        print(f"{bpm:>5}  {(t.get('camelot') or '?'):>4}  {e:>4}  "
              f"[{', '.join(t['reasons'])}]  {t['title']} - {t['artist']}")
