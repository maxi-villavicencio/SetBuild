"""Lee la master.db de Rekordbox (v6/v7) y hace upsert en la tabla `tracks`.

Rekordbox ya calcula BPM y KEY de forma confiable: los traemos tal cual, no se recalculan.
Requisitos: Rekordbox cerrado, y la clave cacheada (una vez):
    python -m pyrekordbox download-key
"""
from pyrekordbox import Rekordbox6Database

from .camelot import key_to_camelot
from .derive import collection_of, quality_of
from .db import get_conn


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _bpm(content):
    """Rekordbox guarda el BPM x100 (128.00 -> 12800). Normalizamos si hace falta."""
    v = _f(getattr(content, "BPM", None))
    if v is None:
        return None
    return v / 100.0 if v > 1000 else v


def _stars(rating):
    """Rekordbox guarda el rating en 0/51/102/153/204/255 -> 0..5 estrellas."""
    v = _f(rating)
    return round(v / 51) if v else None


def _name_of(obj):
    return getattr(obj, "Name", None) if obj is not None else None


def fetch_rekordbox_tracks():
    """Devuelve una lista de dicts, uno por track de la coleccion de Rekordbox."""
    db = Rekordbox6Database()  # abre la master.db local (usa la clave cacheada)
    rows = []
    for c in db.get_content():
        key_obj = getattr(c, "Key", None)
        key_name = None
        if key_obj is not None:
            key_name = getattr(key_obj, "ScaleName", None) or str(key_obj)
        file_path = getattr(c, "FolderPath", None)
        rows.append({
            "rb_content_id": str(getattr(c, "ID", "")),
            "title": getattr(c, "Title", None),
            "artist": _name_of(getattr(c, "Artist", None)),
            "album": _name_of(getattr(c, "Album", None)),
            "genre": _name_of(getattr(c, "Genre", None)),
            "file_path": file_path,
            "duration_sec": _f(getattr(c, "Length", None)),
            "bpm": _bpm(c),
            "key_musical": key_name,
            "camelot": key_to_camelot(key_name),
            "rating": _stars(getattr(c, "Rating", None)),
            "quality": quality_of(file_path),
            "collection": collection_of(file_path),
        })
    return rows


_UPSERT = """
MERGE dbo.tracks AS t
USING (SELECT ? AS rb_content_id) AS s
ON t.rb_content_id = s.rb_content_id
WHEN MATCHED THEN UPDATE SET
    title=?, artist=?, album=?, genre=?, file_path=?, duration_sec=?,
    bpm=?, key_musical=?, camelot=?, rating=?, quality=?, collection=?,
    updated_at=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
    (rb_content_id, title, artist, album, genre, file_path, duration_sec,
     bpm, key_musical, camelot, rating, quality, collection)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?);
"""


def ingest():
    rows = fetch_rekordbox_tracks()
    conn = get_conn()
    cur = conn.cursor()
    for r in rows:
        cur.execute(_UPSERT,
            r["rb_content_id"],
            # UPDATE
            r["title"], r["artist"], r["album"], r["genre"], r["file_path"],
            r["duration_sec"], r["bpm"], r["key_musical"], r["camelot"], r["rating"],
            r["quality"], r["collection"],
            # INSERT
            r["rb_content_id"], r["title"], r["artist"], r["album"], r["genre"],
            r["file_path"], r["duration_sec"], r["bpm"], r["key_musical"],
            r["camelot"], r["rating"], r["quality"], r["collection"],
        )
    conn.commit()
    conn.close()
    print(f"Ingestados {len(rows)} tracks desde Rekordbox.")
    return len(rows)
