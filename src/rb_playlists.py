"""Importa la estructura completa de carpetas/playlists de Rekordbox (capa de navegacion).

NO reemplaza el genero canonico (Sprint 9), que sigue alimentando el motor. Esto es una capa
adicional para mostrar la biblioteca organizada igual que en Rekordbox.

Solo lectura sobre Rekordbox (pyrekordbox); escribe solo en NUESTRAS tablas rb_playlists /
rb_playlist_tracks. Correr con Rekordbox cerrado (toca la master.db, como 'ingest').

La importacion hace FULL REFRESH -> idempotente: re-correrla refleja el estado actual sin duplicar.
"""
from pyrekordbox import Rekordbox6Database

from .db import get_conn


def _fetch_nodes():
    """Lee los nodos de Rekordbox y devuelve (playlists_rows, tracks_rows).

    playlists_rows: (rb_id, name, node_type, parent_id, seq)
    tracks_rows:    (rb_playlist_id, position, rb_content_id)  -- position 1..N por TrackNo
    """
    db = Rekordbox6Database()
    pl_rows, tr_rows = [], []
    for node in db.get_playlist():
        rb_id = int(node.ID)
        node_type = "folder" if getattr(node, "is_folder", False) else "playlist"
        pid = getattr(node, "ParentID", None)
        parent_id = int(pid) if isinstance(pid, int) or (isinstance(pid, str) and pid.isdigit()) else None
        seq = getattr(node, "Seq", None)
        pl_rows.append((rb_id, getattr(node, "Name", None), node_type, parent_id, seq))

        if node_type == "playlist":
            songs = list(getattr(node, "Songs", None) or [])
            songs.sort(key=lambda s: (s.TrackNo if s.TrackNo is not None else 0))
            for pos, s in enumerate(songs, 1):  # position 1..N, en el orden de Rekordbox
                tr_rows.append((rb_id, pos, str(s.ContentID)))
    return pl_rows, tr_rows


def import_playlists():
    """Full refresh de rb_playlists / rb_playlist_tracks desde Rekordbox. Idempotente."""
    pl_rows, tr_rows = _fetch_nodes()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM dbo.rb_playlist_tracks")
    cur.execute("DELETE FROM dbo.rb_playlists")
    for r in pl_rows:
        cur.execute(
            "INSERT INTO dbo.rb_playlists (rb_id, name, node_type, parent_id, seq) VALUES (?,?,?,?,?)", *r)
    for r in tr_rows:
        cur.execute(
            "INSERT INTO dbo.rb_playlist_tracks (rb_playlist_id, position, rb_content_id) VALUES (?,?,?)", *r)
    conn.commit()
    conn.close()
    n_pl = sum(1 for r in pl_rows if r[2] == "playlist")
    n_fo = sum(1 for r in pl_rows if r[2] == "folder")
    print(f"Playlists importadas: {n_fo} carpetas, {n_pl} playlists, {len(tr_rows)} tracks en playlists.")
    return len(pl_rows)


def get_tree():
    """Devuelve la jerarquia como lista de nodos raiz, cada uno con `children` (recursivo).
    Cada nodo: rb_id, name, node_type, seq, track_count (para playlists), children."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT rb_id, name, node_type, parent_id, seq FROM dbo.rb_playlists")
    nodes = {}
    for r in cur.fetchall():
        nodes[r[0]] = dict(rb_id=r[0], name=r[1], node_type=r[2], parent_id=r[3],
                           seq=r[4], track_count=0, children=[])
    # conteo de tracks por playlist
    cur.execute("SELECT rb_playlist_id, COUNT(*) FROM dbo.rb_playlist_tracks GROUP BY rb_playlist_id")
    for pid, n in cur.fetchall():
        if pid in nodes:
            nodes[pid]["track_count"] = n
    conn.close()

    roots = []
    for node in nodes.values():
        parent = nodes.get(node["parent_id"])
        if parent is not None:
            parent["children"].append(node)
        else:
            roots.append(node)  # parent_id NULL o padre inexistente -> raiz

    def sort_rec(items):
        items.sort(key=lambda n: (n["seq"] if n["seq"] is not None else 0, n["name"] or ""))
        for it in items:
            sort_rec(it["children"])
    sort_rec(roots)
    return roots
