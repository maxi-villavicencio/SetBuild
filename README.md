# DJ Set Builder

Arma sets de DJ ordenados por una curva de energía, respetando mezcla armónica
(rueda de Camelot) y transiciones de BPM suaves. Los datos de la colección salen de
**Rekordbox** (BPM y key ya calculados) y el **score de energía/groove** se computa
localmente con `librosa` sobre tus archivos AIFF. Todo offline y gratis.

## Cómo funciona

```
Rekordbox master.db  ──(pyrekordbox)──►  tabla `tracks`  (title, artist, bpm, key, camelot)
                                                │
tus AIFF  ──(librosa)──►  tabla `track_features`  (rms, onset_rate, low_band, pulse_clarity)
                                                │
                                    recompute-energy  ──►  energy_score 1..10
                                                │
                                          build  ──►  set ordenado por curva de energía
```

- **BPM y key**: vienen de Rekordbox, no se recalculan (su detección es mejor).
- **Energía/groove**: es el diferencial; lo derivamos nosotros porque Spotify dio de
  baja sus audio-features en nov 2024 y no hay reemplazo oficial.

## Setup

1. **SQL Server** corriendo. Copiá `.env.example` a `.env` y completá la conexión
   (o exportá esas variables en tu shell).
2. Instalá dependencias:
   ```
   pip install -r requirements.txt
   ```
3. **Clave de Rekordbox** (una sola vez, si estás en Rekordbox 6.6.5 o posterior):
   ```
   python -m pyrekordbox download-key
   ```
4. Hacé un backup de tu biblioteca en Rekordbox (File > Library > Backup Library)
   y **cerrá Rekordbox** antes de ingestar.

## Uso

```
python -m src.cli init-db            # crea las tablas
python -m src.cli ingest             # Rekordbox -> tracks
python -m src.cli analyze            # librosa -> features (paso lento, corre una vez)
python -m src.cli recompute-energy   # features -> energy_score 1..10
python -m src.cli build --length 15 --save "Warmup Sabado"
python -m src.cli next --track 213         # sugiere candidatos para el siguiente track
```

Opciones de `build`:
- `--length N` cantidad de tracks
- `--bpm-tol 0.06` tolerancia de BPM entre temas consecutivos (6%)
- `--peak 0.7` dónde cae el pico de energía (0..1)
- `--energy-boost` habilita el salto +7 de Camelot (subir una quinta)
- `--start <track_id>` fija el primer track
- `--mode limpio|realista` limpio (default) = solo lossless de Maxi; realista = todo
- `--quality lossless|compressed` y `--collection Maxi|Zoe` overrides que pisan el modo

## Backend (Fase 2)

API local con FastAPI que reutiliza el mismo motor de `src/` (solo lectura).

```
uvicorn app.main:app --reload
```

- Doc interactiva (probás los endpoints con un botón): http://127.0.0.1:8000/docs
- Endpoints:
  - `GET /health` → `{"status": "ok"}`
  - `GET /tracks` → la biblioteca en JSON. Query params opcionales:
    `quality` (`lossless`/`compressed`), `collection` (`Maxi`/`Zoe`),
    `only_representatives` (true = un solo track por grupo de duplicados).
  - `GET /next-candidates` → dado un `track_id` actual, los mejores candidatos para el
    siguiente track (Camelot + BPM + energía). Params: `limit`, `target_energy`
    (subila/bajala para algo más movido/tranqui), `mode`, `quality`, `collection`,
    `energy_boost`. Cada candidato trae `reasons` (ej. "misma key", "energía similar").

Ejemplos:
```
http://127.0.0.1:8000/tracks
http://127.0.0.1:8000/tracks?only_representatives=true&collection=Maxi
```

## Frontend (Fase 2)

Interfaz web en React (Vite) para **ver la biblioteca**: tabla ordenable por columna
(energía, BPM, etc.), filtros de calidad/colección y toggle "solo representantes", con
contador de tracks. Consume el endpoint `GET /tracks`.

Requisito: tener el backend corriendo (`uvicorn app.main:app`). Después:

```
cd frontend
npm install
npm run dev
```

Abre en http://localhost:5173. Si tu backend no está en `http://127.0.0.1:8000`, seteá
`VITE_API_URL` (ej. en `frontend/.env`: `VITE_API_URL=http://127.0.0.1:8001`).

## Estructura

```
src/
  db.py         conexión a SQL Server
  camelot.py    mapeo key -> Camelot + reglas de compatibilidad
  ingest.py     lee la master.db de Rekordbox
  analyze.py    features de audio + energy_score
  dedupe.py     de-duplicación (grupos + representante por calidad)
  derive.py     campos derivados del file_path (quality, collection)
  library.py    lectura de la biblioteca (la usa el backend)
  build_set.py  armador greedy sobre la curva de energía
  cli.py        entrypoint
app/
  main.py       backend FastAPI (GET /health, GET /tracks)
frontend/       app React + Vite (ver la biblioteca)
sql/schema.sql  esquema de tablas
```

## Próximos pasos (para Claude Code)

- Afinar los pesos del `energy_score` en `analyze.WEIGHTS` a tu oído.
- Cachear los features de audio a disco para no reanalizar entre runs.
- Reemplazar el greedy por beam search sobre un grafo de compatibilidad.
- Exportar el set generado como playlist de Rekordbox (XML) para reimportarlo.
