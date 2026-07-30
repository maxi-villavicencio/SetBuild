"""Backend FastAPI del DJ Set Builder (Fase 2).

Reusa el motor existente en src/ (no reimplementa acceso a datos). Solo lectura.

Levantar:
    uvicorn app.main:app --reload
Doc interactiva: http://127.0.0.1:8000/docs
"""
from typing import List, Optional
from typing import Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
