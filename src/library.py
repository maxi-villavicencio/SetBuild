"""Lectura de la biblioteca para el backend (y a futuro el frontend).

Centraliza el acceso a datos de "listar tracks" para que la API no duplique SQL.
Reusa la conexion de siempre (src.db.get_conn). Invariante: solo LEE (SELECT).
"""
from .db import get_conn


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

    sql = """
        SELECT t.track_id, t.title, t.artist, t.bpm, t.camelot, t.key_musical,
               f.energy_score, t.quality, t.collection, t.is_representative
        FROM dbo.tracks t
        LEFT JOIN dbo.track_features f ON f.track_id = t.track_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY t.artist, t.title"

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, *params)
    rows = []
    for r in cur.fetchall():
        rows.append(dict(
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
        ))
    conn.close()
    return rows
