"""Lectura de la biblioteca para el backend (y a futuro el frontend).

Centraliza el acceso a datos de "listar tracks" para que la API no duplique SQL.
Reusa la conexion de siempre (src.db.get_conn). Invariante: solo LEE (SELECT).
"""
from .db import get_conn


_SELECT_COLS = """
    t.track_id, t.title, t.artist, t.bpm, t.camelot, t.key_musical,
    f.energy_score, t.quality, t.collection, t.is_representative, t.genre_canonical,
    t.duration_sec
"""


def _row_to_track(r):
    return dict(
        track_id=r[0],
        title=r[1],
        artist=r[2],
        bpm=(float(r[3]) if r[3] is not None else None),
        camelot=r[4],
        key_musical=r[5],
        energy_score=(float(r[6]) if r[6] is not None else None),
        quality=r[7],
        collection=r[8],
        is_representative=(bool(r[9]) if r[9] is not None else None),
        genre_canonical=r[10],
        duration_sec=(float(r[11]) if r[11] is not None else None),
    )


def get_track(track_id):
    """Devuelve un track por id (sin filtros: es dato dado, no candidato) o None."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT " + _SELECT_COLS +
        " FROM dbo.tracks t LEFT JOIN dbo.track_features f ON f.track_id = t.track_id"
        " WHERE t.track_id = ?", track_id)
    row = cur.fetchone()
    conn.close()
    return _row_to_track(row) if row else None


def get_playlist_tracks(rb_playlist_id):
    """Tracks de una playlist de Rekordbox EN ORDEN, resueltos a nuestra biblioteca (mismos campos).

    Los rb_content_id que no estan en dbo.tracks se saltean (JOIN). Devuelve None si la playlist
    no existe (para 404); lista (posiblemente vacia) si existe (carpeta o playlist vacia -> [])."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM dbo.rb_playlists WHERE rb_id = ?", rb_playlist_id)
    if cur.fetchone() is None:
        conn.close()
        return None
    cur.execute(
        "SELECT " + _SELECT_COLS +
        " FROM dbo.rb_playlist_tracks pt"
        " JOIN dbo.tracks t ON t.rb_content_id = pt.rb_content_id"
        " LEFT JOIN dbo.track_features f ON f.track_id = t.track_id"
        " WHERE pt.rb_playlist_id = ? ORDER BY pt.position", rb_playlist_id)
    rows = [_row_to_track(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_all_track_paths():
    """Devuelve [(track_id, file_path)] de todos los tracks con file_path (para pre-transcodificar)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT track_id, file_path FROM dbo.tracks WHERE file_path IS NOT NULL")
    rows = [(r[0], r[1]) for r in cur.fetchall()]
    conn.close()
    return rows


def get_track_file_path(track_id):
    """Devuelve (existe_en_db, file_path) para servir el audio. Solo lee la ruta."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT file_path FROM dbo.tracks WHERE track_id = ?", track_id)
    row = cur.fetchone()
    conn.close()
    if row is None:
        return (False, None)
    return (True, row[0])


def get_tracks(quality=None, collection=None, only_representatives=False):
    """Devuelve la biblioteca como lista de dicts.

    LEFT JOIN a track_features: un track sin features igual aparece (energy_score None).
    Filtros opcionales:
      - quality: 'lossless' | 'compressed'
      - collection: 'Maxi' | 'Zoe'
      - only_representatives: un solo track por grupo de dedup. Usa la misma convencion
        que el armador: si nunca se corrio dedupe (is_representative NULL) no filtra.
    """
    where = []
    params = []
    if quality is not None:
        where.append("t.quality = ?")
        params.append(quality)
    if collection is not None:
        where.append("t.collection = ?")
        params.append(collection)
    if only_representatives:
        where.append("(t.is_representative = 1 OR t.is_representative IS NULL)")

    sql = ("SELECT " + _SELECT_COLS +
           " FROM dbo.tracks t LEFT JOIN dbo.track_features f ON f.track_id = t.track_id")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY t.artist, t.title"

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, *params)
    rows = [_row_to_track(r) for r in cur.fetchall()]
    conn.close()
    return rows


# --- Sets guardados (dbo.sets / dbo.set_tracks). Solo escribe en NUESTRA base. ---

def save_set(name, track_ids):
    """Persiste un set con su nombre y la lista ORDENADA de track_ids. Devuelve el set guardado."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO dbo.sets (name) OUTPUT INSERTED.set_id VALUES (?)", name)
    set_id = cur.fetchone()[0]
    for pos, tid in enumerate(track_ids, 1):
        cur.execute("INSERT INTO dbo.set_tracks (set_id, position, track_id) VALUES (?,?,?)",
                    set_id, pos, tid)
    conn.commit()
    conn.close()
    return get_set(set_id)


def list_sets():
    """Lista los sets guardados: id, nombre, fecha, cantidad de tracks y duracion total."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT s.set_id, s.name, s.created_at,
               COUNT(st.track_id) AS track_count,
               SUM(t.duration_sec) AS duration_sec
        FROM dbo.sets s
        LEFT JOIN dbo.set_tracks st ON st.set_id = s.set_id
        LEFT JOIN dbo.tracks t ON t.track_id = st.track_id
        GROUP BY s.set_id, s.name, s.created_at
        ORDER BY s.created_at DESC
    """)
    out = []
    for r in cur.fetchall():
        out.append(dict(
            set_id=r[0], name=r[1], created_at=r[2],
            track_count=int(r[3]) if r[3] is not None else 0,
            duration_sec=(float(r[4]) if r[4] is not None else None),
        ))
    conn.close()
    return out


def get_set(set_id):
    """Devuelve un set guardado con sus tracks en orden, o None si no existe."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT set_id, name, created_at FROM dbo.sets WHERE set_id = ?", set_id)
    head = cur.fetchone()
    if head is None:
        conn.close()
        return None
    cur.execute(
        "SELECT " + _SELECT_COLS +
        " FROM dbo.set_tracks st"
        " JOIN dbo.tracks t ON t.track_id = st.track_id"
        " LEFT JOIN dbo.track_features f ON f.track_id = t.track_id"
        " WHERE st.set_id = ? ORDER BY st.position", set_id)
    tracks = [_row_to_track(r) for r in cur.fetchall()]
    conn.close()
    return dict(set_id=head[0], name=head[1], created_at=head[2], tracks=tracks)


def get_set_for_export(set_id):
    """Devuelve (name, tracks en orden) para exportar a XML, incluyendo file_path.

    file_path NO se expone en la API general (solo se usa para el Location del XML).
    Devuelve None si el set no existe."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT name FROM dbo.sets WHERE set_id = ?", set_id)
    head = cur.fetchone()
    if head is None:
        conn.close()
        return None
    cur.execute("""
        SELECT t.track_id, t.file_path, t.title, t.artist, t.bpm, t.camelot,
               t.genre_canonical, t.duration_sec
        FROM dbo.set_tracks st
        JOIN dbo.tracks t ON t.track_id = st.track_id
        WHERE st.set_id = ? ORDER BY st.position
    """, set_id)
    tracks = []
    for r in cur.fetchall():
        tracks.append(dict(
            track_id=r[0], file_path=r[1], title=r[2], artist=r[3],
            bpm=(float(r[4]) if r[4] is not None else None), camelot=r[5],
            genre_canonical=r[6], duration_sec=(float(r[7]) if r[7] is not None else None),
        ))
    conn.close()
    return dict(name=head[0], tracks=tracks)


def delete_set(set_id):
    """Borra un set (la cascada de set_tracks lo limpia). Devuelve True si existia."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM dbo.sets WHERE set_id = ?", set_id)
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return deleted > 0
