# CLAUDE.md

Contexto e invariantes del proyecto para Claude Code. Leer también `NOTES.md`, que es
la spec completa y fuente de verdad de todas las decisiones de producto.

## Qué es

Herramienta para armar sets de DJ ordenados por una curva de energía, respetando mezcla
armónica (Camelot), BPM, género y momento del set. Los datos salen de Rekordbox; el score
de energía/groove lo calculamos con librosa sobre el audio local. Arranca como web app
**local-first** para uso propio, con vistas a una versión pública más adelante.

## INVARIANTES (no violar nunca)

1. **Solo lectura sobre Rekordbox y los archivos de audio.** El código NUNCA mueve, renombra,
   borra ni reorganiza la carpeta de audio del usuario, ni modifica la `master.db` ni la
   estructura de Rekordbox. `pyrekordbox` abre la base en modo lectura. Si un archivo se
   mueve, Rekordbox pierde la referencia.
2. **BPM y KEY vienen de Rekordbox, no se recalculan.** Solo el `energy_score` se computa
   con librosa.
3. **Degradación con gracia.** Ningún dato es obligatorio. Datos faltantes (sin estrella,
   sin key, sin energía, archivo missing, MP3 de baja calidad) NO deben romper el flujo:
   el track participa distinto y se marca el porqué. Ver NOTES.md.
4. **No escribir estrellas ni nada de vuelta a Rekordbox.** Las sugerencias se guardan en
   nuestra propia DB o se muestran para que el usuario las aplique a mano.
5. **Secretos fuera del repo.** Nada de credenciales en el código; van en `.env` (ya en
   `.gitignore`). No commitear audio, `.db`, ni exports de Rekordbox.

## Estado actual

- Fase 1 (motor core) completa y probada con datos reales vía CLI.
- 998 tracks ingestados; 937 con `energy_score` (61 "missing", se dejan así).
- Siguiente: Fase 1.5 (capa de datos) y luego Fase 2 (web local). Ver roadmap en NOTES.md.

## Estructura

```
src/
  db.py         conexión a SQL Server (pyodbc + python-dotenv)
  camelot.py    key -> Camelot + reglas de compatibilidad
  ingest.py     lee la master.db de Rekordbox -> tabla tracks
  analyze.py    features de audio (librosa) + energy_score
  build_set.py  armador greedy sobre la curva de energía
  cli.py        entrypoint (refresh = pipeline completo; init-db, ingest, dedupe, build, next, ...)
sql/schema.sql  esquema de tablas (SQL Server / T-SQL)
NOTES.md        spec completa (leer antes de diseñar features)
```

## Entorno / cómo correr

- Windows, SQL Server local (instancia `MAXI\SQLEXPRESS`, base `SetBuild`, auth de Windows).
- ODBC Driver 18 for SQL Server. Conexión configurada por `.env`.
- Python en venv (`.venv`). Rekordbox 7.2.3, pyrekordbox 0.4.4 (la clave se resuelve sola).
- Correr siempre con Rekordbox cerrado los comandos que tocan la `master.db`.

**Atajo recomendado para actualizar la biblioteca** (con Rekordbox cerrado): un solo comando
corre todo el pipeline en el orden correcto.

```
python -m src.cli init-db     # una vez, crea/migra las tablas
python -m src.cli refresh      # todo el pipeline (ver flags abajo)
python -m src.cli build --length 10
```

`refresh` corre en orden: `ingest` → `import-playlists` → `assign-genre` → `derive-fields` →
`dedupe` → `analyze` → `recompute-energy` → pre-transcodificación de AIFF. Cada paso es
incremental/idempotente. Flags: `--data-only` (solo los pasos rápidos de datos, sin análisis ni
transcodificación), `--skip-analyze` (salta el análisis de audio + energía), `--skip-transcode`.

Los comandos sueltos siguen existiendo como referencia de qué hace cada paso (todos los corre
`refresh`):

```
python -m src.cli ingest             # Rekordbox master.db -> tabla tracks (+ playlists + pre-transcode)
python -m src.cli import-playlists   # carpetas/playlists de Rekordbox -> capa de navegacion
python -m src.cli assign-genre       # genre_canonical desde las playlists
python -m src.cli derive-fields      # quality/collection desde el file_path (antes de dedupe)
python -m src.cli dedupe             # grupos de duplicados + representante por calidad
python -m src.cli analyze            # librosa -> features (paso lento; solo faltantes)
python -m src.cli recompute-energy   # features -> energy_score 1..10
```

## Convenciones

- Comentarios y mensajes de usuario en español; identificadores de código en inglés.
- Cambios de esquema: reflejarlos en `sql/schema.sql` Y dar el `ALTER` para la base ya creada.
- Antes de tocar features de producto, releer la sección correspondiente de NOTES.md.
- Preferir cambios chicos y testeables por CLI antes de sumar complejidad (web, etc.).
