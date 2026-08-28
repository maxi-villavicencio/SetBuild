# DJ Set Builder — Spec del proyecto

Documento de referencia (fuente de verdad) con todas las decisiones tomadas.
De acá salen después los prompts para Claude Code.

## Objetivo

Herramienta para armar sets de DJ ordenados por una curva de energía, respetando
mezcla armónica (Camelot), BPM, género y el momento del set. Arranca como **web app
local-first para uso propio**, con la idea de, si funciona, llevarla al público más adelante.

## Principios

Principio: el filtro de compatibilidad (BPM ±2, género, Camelot) NO se ablanda para compensar
géneros con pocos tracks. La cantidad de tracks por género refleja cómo toca el DJ; si falta
material, la solución es cargar más tracks de ese género, no que el motor baje su estándar. Cuando
no haya candidatos, la herramienta lo comunica con claridad ("sin candidatos compatibles — cargá
más tracks de este género o cambiá el track anterior"), sin empujar a bajar el estándar (no sugerir
"probá otro modo o energía"). La herramienta refleja tu forma de tocar, no la fuerza.

## Fuente de datos y regla de solo-lectura (INVARIANTE)

- Los tracks se bajan de Soundeo → van a Descargas → el usuario los mueve a mano a una
  carpeta `AIFF` → desde ahí los importa a Rekordbox.
- La colección, las playlists (organizadas por género) y las estrellas viven en Rekordbox.
- **La herramienta SOLO LEE. Nunca mueve, renombra, ni reorganiza la carpeta `AIFF`, ni toca
  la estructura de Rekordbox.** Si un archivo se mueve, Rekordbox pierde la referencia.
- Ingesta de la colección: `pyrekordbox` lee la `master.db` (v6/v7, SQLCipher). La clave se
  cachea una vez con `python -m pyrekordbox download-key`. Ingestar con Rekordbox cerrado y
  con backup hecho (File > Library > Backup Library).

## Qué calcula Rekordbox vs qué calculamos nosotros

- **BPM y KEY**: vienen de Rekordbox, NO se recalculan (su detección es mejor).
- **Energía / groove / intensidad**: es el diferencial. Lo derivamos nosotros con `librosa`
  sobre los AIFF, porque Spotify dio de baja audio-features (nov 2024) y no hay reemplazo
  oficial. Score `energy_score` en escala 1..10, combinando rms, onset_rate, low_band_ratio,
  pulse_clarity y spectral_centroid (pesos ajustables a oído).

## Estrellas = momento del set (no calidad)

El usuario usa el rating de Rekordbox como fase del set:

- 1 estrella: intensidad baja
- 2: warm up
- 3: los más movidos (pico)
- 4: bajada
- 5: cierre

Detalles:
- Las estrellas son **relativas dentro de cada género**, no absolutas (un "1" de un género
  puede tener otro BPM que un "1" de otro).
- La clasificación es **incremental**: el usuario todavía no puntuó todo. Se hace en paralelo
  al desarrollo, y cada `ingest` levanta lo nuevo. El armador debe **tolerar estrellas
  faltantes** (los tracks sin puntuar quedan como "sin clasificar", no rompen).
- **Sugerencia de estrella asistida**: a partir del `energy_score`, la herramienta puede
  proponer una estrella por track para que el usuario confirme/corrija (más rápido que de
  cero). Esa sugerencia se calcula **comparando cada track contra los de su mismo género**.
- No escribir estrellas de vuelta a Rekordbox (rompería el invariante de solo-lectura): la
  sugerencia se muestra y el usuario la aplica en Rekordbox, o se guarda como override en
  nuestra propia DB.

## Géneros y compatibilidad de estilos

- Existe una noción de **familias de género compatibles** (matriz configurable por el usuario).
- Restricción concreta: progressive / organic house **no** se combinan con techno.
- El armado prioriza en dos niveles: **primero mismo género**, y **segundo otros géneros
  compatibles** (misma familia o familias que combinan). El mismo género es la opción por
  defecto; el cruce compatible aparece como alternativa para abrir el abanico a propósito.
- **El filtro de género se aplica una vez** (Sprint 28). Con **pool activo** (el usuario eligió
  carpetas/playlists en la vista Rekordbox), el pool **reemplaza** el filtro de género: el
  sugeridor solo combina por **BPM / tonalidad / energía** dentro del pool (el género queda como
  dato/etiqueta, no excluye). **Sin pool**, el sugeridor **sí** aplica el filtro de género (mismo
  + vecinos compatibles). Los filtros duros BPM ±2 y Camelot no cambian en ningún caso.
- **El orden de los candidatos NO depende del género** (Sprint 31). La lista del sugeridor se
  ordena SIEMPRE por **cercanía de energía** al track actual y, dentro de energías parecidas, por
  **transiciones seguras** (misma key / adyacente / relativo) **antes que el energy boost (+7)** —
  de lo más suave y seguro (arriba) a lo más movido/audaz (abajo). Esto vale **con y sin pool**.
  El género dejó de participar del orden; sin pool solo **excluye** incompatibles (no ordena).

## Jerarquía de filtros del armador

Para elegir el próximo track, en orden:

1. **Género**: primero mismo género, después géneros compatibles (respetando la exclusión).
2. **Fase del set** según la estrella (warm up → pico → bajada → cierre).
3. **Compatibilidad armónica** Camelot (mismo, ±1 misma letra, relativo mayor/menor; +7 opcional).
4. **Transición de BPM** suave y ajuste fino por `energy_score`.

## Modos de armado

- **Automático**: arma el set entero siguiendo una curva de energía (greedy; después
  beam search sobre grafo de compatibilidad).
- **Interactivo (sugeridor ramificado)**: propone un track para arrancar; a partir de ese
  tira varias opciones para el segundo (ordenadas por la jerarquía de filtros); el usuario
  elige una y con esa recalcula las opciones del tercero, y así sucesivamente.

## Datos (SQL Server)

- `tracks` (bpm, key_musical, camelot, rating/estrella, genre, file_path, ...)
- `track_features` (rms, onset_rate, low_band_ratio, pulse_clarity, energy_score, ...)
- `sets` + `set_tracks` (sets guardados)
- Pendiente: tabla/config de **familias de género** y sus compatibilidades.

## Arquitectura (local-first, con ojo en lo público)

- **Ahora (propio)**: backend en la máquina del usuario (lee `master.db` + AIFF locales,
  guarda en SQL Server local) + frontend web servido en localhost.
- **Capa de ingesta intercambiable**: definir una interfaz "fuente de tracks" para que la
  versión pública pueda sumar una fuente por **upload del XML de Rekordbox** sin reescribir
  el motor. El análisis de audio en la versión pública se replantea aparte (client-side o
  agente local).

## Casos pendientes de la de-duplicacion

- **Tracks con titulo vacio.** Algunos tracks vienen sin titulo en Rekordbox (ej. varias
  versiones de "Gravitational Arch Of 10" de Vapourspace, una con `title` vacio). Hoy el
  dedupe los deja como grupo propio (no se agrupan ni entre si ni con versiones tituladas),
  a proposito, para no arriesgar falsos positivos. Queda pendiente resolverlos en un sprint
  futuro (posible via fingerprint de audio, o completando el titulo desde el file_path).
- **Ediciones de distinta duracion del mismo tema.** Cuando existen varios edits del mismo
  track con duraciones bien distintas (ej. 285s vs 403s vs 427s), el refuerzo acustico NO los
  une (exige duracion +/-3%), y con razon: son masters distintos. Unificar "todas las versiones
  de un titulo" es otra decision de producto (agrupar por titulo base), no resuelta todavia.

## Reproducción de audio (escuchar tracks en la app)

Necesidad (pedida por un DJ real): poder escuchar los tracks o un
fragmento dentro de la app, para identificarlos y ordenarlos mientras se
arma el set.

Decisión: el audio NO viene de APIs externas.
- No hay API gratis/abierta confiable para previews (Spotify desmanteló
  previews + audio-features; Beatport/SoundCloud son partner-only).
- Soundeo / Muzbase / Traxload no tienen API pública, y scrapearlos es
  legalmente riesgoso. Descartado.
- Además, muchos tracks son releases nuevos que no estarían en ningún
  servicio externo.

La fuente correcta es el ARCHIVO LOCAL del usuario, que ya está en su
disco (carpeta de tracks) y cuya ruta ya tenemos guardada (file_path).

- Versión personal (corre en la máquina del usuario): el backend tiene
  acceso a la carpeta local, así que puede servir el audio al navegador
  para reproducirlo. Factible y gratis ahora.
- Versión pública (servicio web): reaparece EL NUDO DEL AUDIO — el
  archivo está en la máquina del usuario, no en el servidor, y una web
  normal no puede leer el disco del visitante. Vías posibles: app corriendo
  localmente / versión de escritorio / File System Access API del navegador
  (con permiso del usuario, con limitaciones). Es la misma decisión de
  arquitectura de fondo del producto público (dónde vive y se procesa el
  audio), ya anotada.

**Límite del navegador (Sprint 18) y Sprint 19 = transcodificación de AIFF (NO opcional).**
Los navegadores Chromium (Chrome + el browser de la app) NO reproducen `.aiff` nativamente en
`<audio>`. El Sprint 18 sirve el archivo local con streaming + seek y reproduce mp3/wav/flac/m4a
(Zoe suena); para AIFF muestra "formato no soportado en el navegador" sin romper. **El Sprint 19
es transcodificar AIFF (con ffmpeg) para poder reproducir la colección Maxi, que es la principal**
— es el siguiente sprint sí o sí, porque sin eso la reproducción no cubre el material principal.

## Escalabilidad de la biblioteca (pendiente para el público)

Hoy la Biblioteca trae TODOS los tracks de una. Con ~1000 anda bien;
con 20k-50k (DJ real) el navegador se pondría lento. Solución conocida
para la versión pública: paginación (cargar de a N con scroll) o
virtualización (renderizar solo filas visibles). No urgente para uso
personal.

- La vista Rekordbox con "todo tildado" al inicio pide los tracks de TODAS
  las playlists (un GET por playlist). Con pocas playlists anda bien; con
  muchas (50+, DJ real) el primer render se pone lento. Optimizar para el
  público: carga diferida por sección (cargar los tracks de una playlist
  recién al abrirla/al hacer scroll) o secciones colapsadas por defecto.

## Roadmap por fases

- **Fase 0 — Repo y setup**: GitHub, `.gitignore`, estructura, Claude Code enlazado, `CLAUDE.md`.
- **Fase 1 — Motor core** (ya casi hecho): ingest master.db, camelot, analyze/energy, schema.
  Dejarlo como librería importable por el backend.
- **Fase 2 — Web local**: API backend (endpoints: listar biblioteca, disparar analyze,
  sugerir próximo, armar set) + frontend mínimo para ver la biblioteca y disparar acciones.
- **Fase 3 — Sugeridor interactivo** en la UI (elegís inicial → opciones → construís el set).
- **Fase 4 — Estrellas**: sugerencia por `energy_score` por género; confirmación en la UI.
- **Fase 5 — Familias de género**: matriz de compatibilidad configurable.
- **Fase 6 — Export**: generar playlist de Rekordbox (XML) para reimportar el set + pulido.
- **Fase 7 (futuro) — Versión pública**: ingesta por upload XML, análisis replanteado, auth,
  multiusuario.
