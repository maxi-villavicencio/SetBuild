"""Backend FastAPI del DJ Set Builder (Fase 2).

Reusa el motor existente en src/ (no reimplementa acceso a datos). Solo lectura.

Levantar:
    uvicorn app.main:app --reload
Doc interactiva: http://127.0.0.1:8000/docs
"""
import os
from datetime import datetime
from typing import List, Optional
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from src.audio_cache import FfmpegNotAvailable, TranscodeError, is_audio, prepare_playable
from src.build_set import suggest_next
from src.pretranscode import warm_bg
from src.export_xml import build_set_xml, safe_filename
from src.library import (
    delete_set, get_playlist_tracks, get_set, get_set_for_export, get_track_file_path,
    get_tracks, list_sets, save_set,
)
from src.rb_playlists import get_tree

app = FastAPI(
    title="DJ Set Builder API",
    description="Backend local-first. Solo lectura sobre la biblioteca (Rekordbox + features).",
    version="0.1.0",
)

# CORS para el frontend de Vite en desarrollo (puerto 5173).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


class Track(BaseModel):
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[float] = None
    camelot: Optional[str] = None
    key_musical: Optional[str] = None
    energy_score: Optional[float] = None
    quality: Optional[str] = None
    collection: Optional[str] = None
    genre_canonical: Optional[str] = None
    duration_sec: Optional[float] = None
    is_representative: Optional[bool] = None


@app.get("/health")
def health():
    """Chequeo simple de que el server levanta."""
    return {"status": "ok"}


@app.get("/tracks", response_model=List[Track])
def list_tracks(
    quality: Optional[Literal["lossless", "compressed"]] = Query(
        None, description="Filtra por calidad derivada del archivo"),
    collection: Optional[Literal["Maxi", "Zoe"]] = Query(
        None, description="Filtra por coleccion derivada de la carpeta"),
    only_representatives: bool = Query(
        False, description="Un solo track por grupo de duplicados (sin repetir tema)"),
    playlist_ids: Optional[List[int]] = Query(
        None, description="Acota a los tracks de esas playlists/carpetas (union, carpetas "
                          "expandidas). Deduplica: un track en varias playlists aparece una vez."),
):
    """Lista la biblioteca. Los filtros son opcionales y se combinan."""
    return get_tracks(
        quality=quality,
        collection=collection,
        only_representatives=only_representatives,
        playlist_ids=playlist_ids,
    )


class Candidate(BaseModel):
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[float] = None
    camelot: Optional[str] = None
    energy_score: Optional[float] = None
    quality: Optional[str] = None
    collection: Optional[str] = None
    genre_canonical: Optional[str] = None
    duration_sec: Optional[float] = None
    reasons: List[str] = []


@app.get("/next-candidates", response_model=List[Candidate])
def next_candidates(
    track_id: int = Query(..., description="track_id del track actual"),
    limit: Optional[int] = Query(
        None, ge=1, description="Tope de candidatos; por defecto (None) devuelve TODOS los compatibles"),
    target_energy: Optional[float] = Query(
        None, ge=1, le=10,
        description="Energia objetivo (1..10); por defecto la del track actual "
                    "(subila para 'algo mas movido', bajala para 'algo mas tranqui')"),
    mode: Literal["limpio", "realista"] = Query(
        "realista", description="limpio = lossless de Maxi; realista = todo"),
    quality: Optional[Literal["lossless", "compressed"]] = Query(None),
    collection: Optional[Literal["Maxi", "Zoe"]] = Query(None),
    playlist_ids: Optional[List[int]] = Query(
        None, description="Acota el pool a los tracks de esas playlists/carpetas de Rekordbox"),
):
    """Dado un track actual, devuelve los mejores candidatos para el siguiente track del set.

    Filtros duros: BPM +/-2 y Camelot compatible (misma/+-1/relativo/+7 energy boost). Ranking
    (Sprint 31): por ENERGIA (cercania al track actual) -> transicion segura antes que +7 -> BPM;
    el genero NO ordena. Excluye el track actual y usa solo representantes. Un candidato sin
    key/energia aparece despriorizado y marcado en `reasons`.
    Con `playlist_ids`, el pool se restringe a esas playlists/carpetas (union, carpetas expandidas)
    y el sugeridor NO vuelve a filtrar por genero (el pool ya eligio los generos): solo combina por
    BPM/tonalidad/energia dentro del pool. Sin `playlist_ids`, aplica el filtro de genero (mismo + vecinos).
    """
    result = suggest_next(
        track_id, limit=limit, target_energy=target_energy, mode=mode,
        quality=quality, collection=collection, playlist_ids=playlist_ids)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No existe el track_id {track_id}")
    # Adelanta en segundo plano la conversion de los candidatos AIFF (no bloquea la respuesta).
    # Se acota a los primeros (los mas probables de elegir) para no disparar una tormenta de
    # transcodificaciones cuando la lista es larga (sin limite puede traer 100+).
    warm_bg([c["track_id"] for c in result["candidates"][:12]])
    return result["candidates"]


@app.get("/tracks/{track_id}/audio")
def track_audio(track_id: int):
    """Sirve el audio LOCAL del track (streaming con Range/seek). Los formatos nativos van directo;
    los que el navegador no soporta (ej. AIFF) se transcodifican a mp3 cacheado (ver audio_cache).

    Seguridad: nunca recibe una ruta; busca el file_path del track en la DB y sirve SOLO ese
    archivo (sin path traversal). El original solo se lee, nunca se modifica."""
    exists, path = get_track_file_path(track_id)
    if not exists:
        raise HTTPException(status_code=404, detail=f"No existe el track_id {track_id}")
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco.")
    if not is_audio(os.path.splitext(path)[1]):  # solo servimos audio
        raise HTTPException(status_code=404, detail="El archivo no es de audio soportado.")
    try:
        serve_path, media_type = prepare_playable(track_id, path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FfmpegNotAvailable:
        raise HTTPException(
            status_code=503,
            detail="ffmpeg no esta instalado; es necesario para reproducir AIFF. Ver README.")
    except TranscodeError as e:
        raise HTTPException(status_code=500, detail=f"No se pudo preparar el audio: {e}")
    # FileResponse maneja los Range requests (206) para que el <audio> pueda hacer seek.
    return FileResponse(serve_path, media_type=media_type)


# --- Sets guardados ---

class SetCreate(BaseModel):
    name: str
    track_ids: List[int]


class SetSummary(BaseModel):
    set_id: int
    name: Optional[str] = None
    created_at: Optional[datetime] = None
    track_count: int = 0
    duration_sec: Optional[float] = None


class SetDetail(BaseModel):
    set_id: int
    name: Optional[str] = None
    created_at: Optional[datetime] = None
    tracks: List[Track] = []


@app.post("/sets", response_model=SetDetail)
def create_set(body: SetCreate):
    """Guarda un set con su nombre y la lista ordenada de track_ids."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacio.")
    if not body.track_ids:
        raise HTTPException(status_code=400, detail="El set no tiene tracks.")
    return save_set(body.name.strip(), body.track_ids)


@app.get("/sets", response_model=List[SetSummary])
def get_sets():
    """Lista los sets guardados."""
    return list_sets()


@app.get("/sets/{set_id}", response_model=SetDetail)
def get_one_set(set_id: int):
    """Devuelve un set guardado con sus tracks en orden."""
    result = get_set(set_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No existe el set {set_id}")
    # Adelanta en segundo plano la conversion de los tracks AIFF del set (no bloquea la respuesta).
    warm_bg([t["track_id"] for t in result["tracks"]])
    return result


@app.delete("/sets/{set_id}")
def remove_set(set_id: int):
    """Borra un set guardado (la cascada limpia set_tracks)."""
    if not delete_set(set_id):
        raise HTTPException(status_code=404, detail=f"No existe el set {set_id}")
    return {"deleted": set_id}


@app.get("/sets/{set_id}/export.xml")
def export_set(set_id: int):
    """Genera el XML de coleccion de Rekordbox del set (para importar a mano). Solo lectura."""
    data = get_set_for_export(set_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No existe el set {set_id}")
    xml_str = build_set_xml(data["name"], data["tracks"])
    filename = safe_filename(data["name"], fallback=f"set_{set_id}")
    return Response(
        content=xml_str,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- Playlists de Rekordbox (capa de navegacion; no reemplaza el genero canonico) ---

class PlaylistNode(BaseModel):
    rb_id: int
    name: Optional[str] = None
    node_type: str  # 'folder' | 'playlist'
    seq: Optional[int] = None
    track_count: int = 0
    children: List["PlaylistNode"] = []


PlaylistNode.model_rebuild()


@app.get("/playlists", response_model=List[PlaylistNode])
def playlists_tree():
    """Jerarquia completa de carpetas y playlists de Rekordbox (arbol), ordenada por seq."""
    return get_tree()


@app.get("/pool")
def pool_size(
    playlist_ids: Optional[List[int]] = Query(
        None, description="Playlists/carpetas seleccionadas; sin esto = toda la biblioteca"),
):
    """Cantidad de tracks (representantes) en el pool de las playlists/carpetas seleccionadas."""
    return {"track_count": len(get_tracks(only_representatives=True, playlist_ids=playlist_ids))}


@app.get("/playlists/{rb_id}/tracks", response_model=List[Track])
def playlist_tracks(rb_id: int):
    """Tracks de una playlist de Rekordbox en orden (resueltos a la biblioteca; los que no estan
    en nuestra tabla tracks se saltean). 404 si la playlist no existe."""
    tracks = get_playlist_tracks(rb_id)
    if tracks is None:
        raise HTTPException(status_code=404, detail=f"No existe la playlist {rb_id}")
    return tracks
