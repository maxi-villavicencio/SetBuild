"""Exporta un set como XML de coleccion de Rekordbox (formato DJ_PLAYLISTS).

Usa el escritor nativo de pyrekordbox (`RekordboxXml`), que es la fuente de verdad del
formato (incluido el Location `file://localhost/...` URL-encodeado por `encode_path`). No
inventamos el formato ni tocamos la master.db: generamos un archivo aparte para importar a mano.

Estructura resultante:
    DJ_PLAYLISTS -> PRODUCT + COLLECTION[TRACK...] + PLAYLISTS[NODE ROOT -> NODE playlist -> TRACK Key]
El NODE playlist referencia los tracks por TrackID, EN ORDEN.
"""
import re

from pyrekordbox.rbxml import RekordboxXml


def build_set_xml(name, tracks):
    """Devuelve el XML (str) del set. `tracks` es la lista ordenada de dicts (ver
    library.get_set_for_export). Los tracks sin file_path se saltean (sin Location no se
    pueden ubicar en Rekordbox)."""
    xml = RekordboxXml()

    added = []
    for t in tracks:
        path = t.get("file_path")
        if not path:
            continue  # sin Location no sirve para importar
        attrs = {}
        if t.get("title") is not None:
            attrs["Name"] = t["title"]
        if t.get("artist") is not None:
            attrs["Artist"] = t["artist"]
        if t.get("genre_canonical") is not None:
            attrs["Genre"] = t["genre_canonical"]
        if t.get("bpm") is not None:
            attrs["AverageBpm"] = float(t["bpm"])
        if t.get("camelot") is not None:
            attrs["Tonality"] = t["camelot"]
        if t.get("duration_sec") is not None:
            attrs["TotalTime"] = int(round(t["duration_sec"]))
        # add_track aplica encode_path al location (file://localhost/ + quote).
        xml.add_track(location=path, TrackID=t["track_id"], **attrs)
        added.append(t["track_id"])

    node = xml.add_playlist(name or "Set")
    for tid in added:
        node.add_track(tid)  # referencia por TrackID, en orden

    return xml.tostring()


def safe_filename(name, fallback="set"):
    """Nombre de archivo seguro (ASCII) para el Content-Disposition."""
    base = (name or "").strip()
    base = re.sub(r"[^A-Za-z0-9 _-]", "", base).strip().replace(" ", "_")
    return (base or fallback) + ".xml"
