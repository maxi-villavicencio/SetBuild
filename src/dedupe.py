"""De-duplicacion de tracks: agrupa los que son el mismo tema.

Criterio principal: titulo + artista NORMALIZADOS (minusculas, sin puntuacion,
sin sufijos de "misma obra / distinto release" como "(Original Mix)", "(Extended Mix)",
"(Extended)"). Se PRESERVA "remix" y el nombre del remixer, porque un remix es otro tema.

Confirmacion: dentro de un mismo (titulo, artista) normalizado, dos tracks se toman como
el mismo solo si ademas tienen BPM parecido (+/-2) y duracion parecida (+/-8%). Si a un
track le falta BPM o duracion, ese criterio NO bloquea el merge (degradacion con gracia).

Refuerzo acustico (segundo pase): puentea diferencias de grafia en titulo/artista cuando
el audio es casi identico. Dos tracks (de distinto grupo primario) se funden si tienen
BPM casi igual (+/-1) Y duracion casi igual (+/-3%) Y los tokens significativos del titulo
mas corto son subconjunto de los del mas largo (con >=2 tokens, para no unir por una sola
palabra comun). Ej: "Insomniac" metido en "Space Food - Insomniac", o BPM pegado al titulo.
Los titulos vacios NO participan de este pase (ver caso pendiente en NOTES.md).

Invariante: esto solo LEE y ESCRIBE en NUESTRA base (dbo.tracks). No toca Rekordbox ni el audio.

Uso por CLI:
    python -m src.cli dedupe            # calcula y persiste los grupos
    python -m src.cli dedupe --report   # ademas imprime totales y ejemplos
"""
import re
from collections import defaultdict

from .db import get_conn

# Tolerancias de confirmacion (pedidas: BPM +/-2 para cada lado; duracion 8% relativo).
BPM_TOL = 2.0
DUR_TOL = 0.08

# Tolerancias del refuerzo acustico (mas estrictas: audio casi identico).
BPM_TIGHT = 1.0
DUR_TIGHT = 0.03

# Palabras que NO cuentan como token significativo del titulo (stopwords + ruido comun).
# ("original|extended|radio|edit|version|mix" ya los saca norm_title antes de tokenizar.)
_STOP_TOKENS = {"the", "and", "feat", "with", "you", "your", "remix"}

# Sufijos/modificadores de "misma obra, distinto release" que se quitan del titulo.
# OJO: "\bmix\b" NO matchea el "mix" dentro de "remix" (no hay borde de palabra), asi que
# los remixes se preservan y quedan como temas distintos.
_MODIFIER_RE = re.compile(r"\b(?:original|extended|radio|edit|version|mix)\b", re.IGNORECASE)
_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)
_SPACE_RE = re.compile(r"\s+")


def norm_title(s):
    """Normaliza un titulo para agrupar. Devuelve '' si no hay titulo."""
    if not s:
        return ""
    t = str(s).lower()
    t = _PUNCT_RE.sub(" ", t)      # fuera puntuacion (parentesis, comas, guiones...)
    t = _MODIFIER_RE.sub(" ", t)   # fuera modificadores de release
    t = _SPACE_RE.sub(" ", t).strip()
    return t


def norm_artist(s):
    """Normaliza un artista para agrupar. Colaboraciones 'A, B' quedan como 'a b'."""
    if not s:
        return ""
    a = str(s).lower()
    a = _PUNCT_RE.sub(" ", a)
    a = _SPACE_RE.sub(" ", a).strip()
    return a


def _bpm_confirms(a, b):
    """True si los BPM confirman el mismo tema. Dato faltante no bloquea."""
    if a is None or b is None:
        return True
    return abs(a - b) <= BPM_TOL


def _dur_confirms(a, b):
    """True si las duraciones (segundos) confirman el mismo tema. Dato faltante no bloquea."""
    if not a or not b or a <= 0 or b <= 0:
        return True
    return abs(a - b) <= max(a, b) * DUR_TOL


def _sig_title_tokens(title):
    """Tokens significativos del titulo normalizado: len>=3, no numericos, no stopwords."""
    return {t for t in norm_title(title).split()
            if len(t) >= 3 and not t.isdigit() and t not in _STOP_TOKENS}


def _acoustic_same(a, b):
    """True si el audio es casi identico: BPM +/-1 y duracion +/-3%. Sin dato -> False (no arriesga)."""
    if a["bpm"] is None or b["bpm"] is None or not a["duration"] or not b["duration"]:
        return False
    return abs(a["bpm"] - b["bpm"]) <= BPM_TIGHT \
        and abs(a["duration"] - b["duration"]) <= max(a["duration"], b["duration"]) * DUR_TIGHT


def _title_subset(tokens_a, tokens_b):
    """True si el conjunto mas chico (con >=2 tokens) es subconjunto del mas grande."""
    small, big = (tokens_a, tokens_b) if len(tokens_a) <= len(tokens_b) else (tokens_b, tokens_a)
    return len(small) >= 2 and small <= big


def _load_tracks(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT track_id, title, artist, bpm, duration_sec
        FROM dbo.tracks
    """)
    rows = []
    for r in cur.fetchall():
        rows.append(dict(
            track_id=r[0], title=r[1], artist=r[2],
            bpm=(float(r[3]) if r[3] is not None else None),
            duration=(float(r[4]) if r[4] is not None else None),
        ))
    return rows


def _primary_groups(tracks):
    """Pase 1: agrupa por (titulo, artista) normalizados, confirmado con BPM +/-2 y duracion +/-8%."""
    # bucket por (titulo, artista) normalizados. Sin titulo -> cada uno solo.
    buckets = defaultdict(list)
    for t in tracks:
        nt = norm_title(t["title"])
        na = norm_artist(t["artist"])
        key = (nt, na) if nt else ("__solo__", t["track_id"])
        buckets[key].append(t)

    # dentro de cada bucket, confirmar con BPM + duracion (clustering greedy, deterministico)
    groups = []
    for key in buckets:
        members = sorted(buckets[key], key=lambda x: x["track_id"])
        subgroups = []
        for t in members:
            placed = False
            for g in subgroups:
                anchor = g[0]  # menor track_id del subgrupo (los procesamos ordenados)
                if _bpm_confirms(t["bpm"], anchor["bpm"]) and _dur_confirms(t["duration"], anchor["duration"]):
                    g.append(t)
                    placed = True
                    break
            if not placed:
                subgroups.append([t])
        groups.extend(subgroups)
    return groups


def _reinforce_acoustic(groups):
    """Pase 2: funde grupos distintos cuyo audio es casi identico (BPM +/-1, duracion +/-3%)
    y cuyos titulos tienen relacion de subconjunto. Los titulos vacios no participan."""
    parent = list(range(len(groups)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    gid = {t["track_id"]: i for i, g in enumerate(groups) for t in g}
    # candidatos: tracks con >=2 tokens significativos de titulo (los vacios/pobres no participan)
    cand = []
    for g in groups:
        for t in g:
            toks = _sig_title_tokens(t["title"])
            if len(toks) >= 2:
                cand.append((t, toks))

    for i in range(len(cand)):
        ta, toks_a = cand[i]
        for j in range(i + 1, len(cand)):
            tb, toks_b = cand[j]
            if find(gid[ta["track_id"]]) == find(gid[tb["track_id"]]):
                continue
            if _acoustic_same(ta, tb) and _title_subset(toks_a, toks_b):
                union(gid[ta["track_id"]], gid[tb["track_id"]])

    merged = defaultdict(list)
    for i, g in enumerate(groups):
        merged[find(i)].extend(g)
    return [sorted(g, key=lambda t: t["track_id"]) for g in merged.values()]


def compute_groups(tracks):
    """Agrupa una lista de tracks (dicts) y devuelve la lista de subgrupos.

    Pase 1 (titulo+artista normalizados + BPM/duracion) y pase 2 (refuerzo acustico).
    El representante es el de menor track_id (por ahora "cualquiera del grupo"; el
    mejor-por-calidad va en otro sprint).
    """
    return _reinforce_acoustic(_primary_groups(tracks))


def _persist(conn, groups):
    cur = conn.cursor()
    for g in groups:
        rep_id = g[0]["track_id"]  # menor track_id = representante
        for t in g:
            cur.execute(
                "UPDATE dbo.tracks SET dup_group_id=?, is_representative=? WHERE track_id=?",
                rep_id, 1 if t["track_id"] == rep_id else 0, t["track_id"],
            )
    conn.commit()


def dedupe(report=False):
    """Calcula los grupos de duplicados y los persiste en dbo.tracks."""
    conn = get_conn()
    tracks = _load_tracks(conn)
    groups = compute_groups(tracks)
    _persist(conn, groups)

    total = len(tracks)
    n_groups = len(groups)
    dupes = sum(len(g) - 1 for g in groups)  # cuantos tracks quedan como no-representantes
    print(f"De-dup: {total} tracks -> {n_groups} grupos ({dupes} duplicados colapsados).")

    if report:
        multi = [g for g in groups if len(g) > 1]
        print(f"\nGrupos con mas de un miembro: {len(multi)}")
        for g in sorted(multi, key=lambda x: -len(x))[:15]:
            rep = g[0]
            print(f"\n  [grupo {rep['track_id']}]  {len(g)} tracks  "
                  f"~{rep['bpm']} BPM  ~{rep['duration']}s")
            for t in g:
                star = "*" if t["track_id"] == rep["track_id"] else " "
                bpm = f"{t['bpm']:.1f}" if t["bpm"] is not None else "  ?"
                print(f"    {star} id={t['track_id']:>4}  {bpm:>5} BPM  "
                      f"{t['title']} - {t['artist']}")

    conn.close()
    return groups
