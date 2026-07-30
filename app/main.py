"""Backend FastAPI del DJ Set Builder (Fase 2).

Reusa el motor existente en src/ (no reimplementa acceso a datos). Solo lectura.

Levantar:
    uvicorn app.main:app --reload
Doc interactiva: http://127.0.0.1:8000/docs
"""
from typing import List, Optional
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.build_set import suggest_next
from src.library import get_tracks

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
    allow_methods=["GET"],
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
):
    """Lista la biblioteca. Los filtros son opcionales y se combinan."""
    return get_tracks(
        quality=quality,
        collection=collection,
        only_representatives=only_representatives,
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
    reasons: List[str] = []


@app.get("/next-candidates", response_model=List[Candidate])
def next_candidates(
    track_id: int = Query(..., description="track_id del track actual"),
    limit: int = Query(6, ge=1, le=50, description="Cuantos candidatos devolver"),
    target_energy: Optional[float] = Query(
        None, ge=1, le=10,
        description="Energia objetivo (1..10); por defecto la del track actual "
                    "(subila para 'algo mas movido', bajala para 'algo mas tranqui')"),
    mode: Literal["limpio", "realista"] = Query(
        "realista", description="limpio = lossless de Maxi; realista = todo"),
    quality: Optional[Literal["lossless", "compressed"]] = Query(None),
    collection: Optional[Literal["Maxi", "Zoe"]] = Query(None),
    energy_boost: bool = Query(False, description="Permite el salto +7 de Camelot"),
):
    """Dado un track actual, devuelve los mejores candidatos para el siguiente track del set.

    Ordenados por compatibilidad (Camelot -> BPM -> cercania de energia). Excluye el track
    actual y usa solo representantes (sin duplicados). Un candidato sin key o sin energia
    aparece pero despriorizado y marcado en `reasons`.
    """
    result = suggest_next(
        track_id, limit=limit, target_energy=target_energy, mode=mode,
        quality=quality, collection=collection, energy_boost=energy_boost)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No existe el track_id {track_id}")
    return result["candidates"]
