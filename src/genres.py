"""Genero canonical de cada track a partir de las playlists de Rekordbox.

En Rekordbox hay dos carpetas madre de playlists (maxi = AIFF/lossless, zoe = compressed)
y adentro playlists nombradas por genero (a veces abreviadas). Este modulo mapea esos
nombres a un genero canonico (taxonomia estilo Beatport) y asigna a cada track el genero
de la(s) playlist(s) en la(s) que esta.

>>> EDITAME <<< El mapeo esta en PLAYLIST_GENRE_MAP (abajo). Para sumar/renombrar generos,
tocá ese diccionario y CANONICAL_GENRES. Las claves se comparan normalizadas (minusculas,
"/" -> espacio, espacios colapsados), asi que "TECH HOUSE", "tech / house" y "Tech House"
caen todas en la misma entrada "tech house".

Invariante: solo LEE Rekordbox (via pyrekordbox, read-only) y ESCRIBE solo la columna
genre_canonical en NUESTRA base. Degradacion con gracia: playlist sin match, o track fuera
de toda playlist de genero, queda con genre_canonical = NULL.
"""
import re
from collections import Counter, defaultdict

from .db import get_conn

# --- Referencia: generos canonicos (estilo Beatport). Ampliable. ---
CANONICAL_GENRES = [
    "Afro House",
    "Tech House",
    "House",
    "Deep House",
    "Techno",
    "Melodic House & Techno",
    "Progressive House",
    "Organic House",
    "Indie Dance",
    "Psy-Trance",
    "Minimal Techno",
    "Dance",
    "Trance",
    "Electronica",
    "Breaks",
    "Drum & Bass",
]

# --- Mapeo editable: nombre de playlist (normalizado) -> genero canonico. ---
# (Melodic techno y Melodic House & Techno se tratan como lo mismo, por decision del usuario.)
PLAYLIST_GENRE_MAP = {
    "afro": "Afro House",
    "organic": "Organic House",
    "progressive": "Progressive House",
    "progre": "Progressive House",
    "melodic": "Melodic House & Techno",
    "melodic techno": "Melodic House & Techno",
    "tech house": "Tech House",
    "techno": "Techno",
    "deep": "Deep House",
    "house": "House",
    "indie": "Indie Dance",
    "psy": "Psy-Trance",
    "dance": "Indie Dance",  # en este contexto "dance" = indie dance
    "minimal": "Minimal Techno",
}

# --- Especificidad para desempatar la moda (mayor = mas especifico). ---
# Los subgeneros le ganan a los paraguas (House, Techno, Dance) cuando hay empate.
GENRE_SPECIFICITY = {
    "Afro House": 2, "Tech House": 2, "Deep House": 2, "Progressive House": 2,
    "Organic House": 2, "Melodic House & Techno": 2, "Indie Dance": 2,
    "Psy-Trance": 2, "Minimal Techno": 2,
    "House": 1, "Techno": 1, "Dance": 1,
}


def normalize(name):
    """Normaliza un nombre de playlist para buscarlo en el mapeo."""
    s = (name or "").lower().replace("/", " ")
    return re.sub(r"\s+", " ", s).strip()


def genre_for_playlist(name):
    """Genero canonico de una playlist, o None si su nombre no matchea ninguno."""
    return PLAYLIST_GENRE_MAP.get(normalize(name))


def _resolve(counter):
    """Elige el genero de un track: moda; si empatan, el mas especifico; luego alfabetico."""
    top = max(counter.values())
    cands = [g for g, c in counter.items() if c == top]
    if len(cands) == 1:
        return cands[0]
    cands.sort(key=lambda g: (-GENRE_SPECIFICITY.get(g, 0), g))
    return cands[0]


def assign_genres(report=False):
    """Lee las playlists de Rekordbox, mapea a genero canonico y lo guarda en genre_canonical.

    Correr con Rekordbox CERRADO (toca la master.db en modo lectura, como 'ingest')."""
    from . import ingest  # import diferido: ingest lee Rekordbox

    playlists = ingest.fetch_playlists()
    matched, ignored = [], []
    content_genres = defaultdict(Counter)
    for pl in playlists:
        g = genre_for_playlist(pl["name"])
        if g is None:
            ignored.append((pl["folder"], pl["name"]))
            continue
        matched.append((pl["folder"], pl["name"], g))
        for cid in pl["content_ids"]:
            content_genres[cid][g] += 1

    resolved = {cid: _resolve(c) for cid, c in content_genres.items()}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE dbo.tracks SET genre_canonical = NULL")  # reset (idempotente)
    for cid, g in resolved.items():
        cur.execute("UPDATE dbo.tracks SET genre_canonical=? WHERE rb_content_id=?", g, cid)
    conn.commit()

    cur.execute("SELECT genre_canonical, COUNT(*) FROM dbo.tracks GROUP BY genre_canonical")
    counts = {(r[0] if r[0] is not None else None): r[1] for r in cur.fetchall()}
    conn.close()

    con_genero = sum(v for k, v in counts.items() if k is not None)
    sin_genero = counts.get(None, 0)
    print(f"Genero asignado: {con_genero} tracks con genero, {sin_genero} sin genero.")

    if report:
        print("\n== Playlists -> genero ==")
        for folder, name, g in sorted(matched):
            print(f"  [{folder:<4}] {name!r:22} -> {g}")
        print("\n== Playlists ignoradas (no matchean genero) ==")
        for folder, name in sorted(ignored):
            print(f"  [{folder:<4}] {name!r}")
        print("\n== Tracks por genero canonico ==")
        for g, n in sorted(counts.items(), key=lambda x: (-x[1], x[0] or "")):
            print(f"  {(g or '(sin genero)'):<26} {n:>4}")

    return resolved
