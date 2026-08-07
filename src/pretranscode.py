"""Pre-transcodificacion automatica de AIFF a mp3 cacheado (reusa audio_cache del Sprint 19).

Dos disparadores, un solo cache compartido:
  1) MASIVO (al ingestar): pretranscode_all() convierte todos los AIFF no cacheados, con progreso,
     concurrencia limitada y prioridad de CPU baja. Idempotente y resumible (el cache persiste).
  2) BAJO DEMANDA (backend): warm_bg(track_ids) adelanta en segundo plano los tracks de un set /
     candidatos, con prioridad normal (le gana CPU a la masiva). No bloquea la respuesta.

No duplica la logica de conversion: todo pasa por audio_cache.transcode_track.
"""
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import audio_cache
from .library import get_all_track_paths, get_track_file_path


def _pending(rows):
    """Filtra (track_id, path) que necesitan transcodificarse: audio no-nativo, archivo presente,
    no cacheado todavia."""
    out = []
    for tid, path in rows:
        if not path or not os.path.isfile(path):
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext in audio_cache.NATIVE_EXTS or not audio_cache.is_audio(ext):
            continue  # nativo (no se transcodifica) o no-audio
        if audio_cache.is_cached(tid, path):
            continue  # cache hit -> se saltea (evita retrabajo)
        out.append((tid, path))
    return out


def pretranscode_all(max_workers=2, log=print):
    """Disparador 1 (ingest): transcodifica todos los AIFF pendientes. Progreso visible,
    concurrencia limitada, prioridad baja. Cortable con Ctrl+C y resumible (el cache persiste)."""
    if not audio_cache.ffmpeg_path():
        log("ffmpeg no esta instalado: se omite la pre-transcodificacion de AIFF (ver README).")
        return 0

    pending = _pending(get_all_track_paths())
    total = len(pending)
    if total == 0:
        log("Pre-transcodificacion: nada pendiente (todo en cache o sin AIFF).")
        return 0

    log(f"Pre-transcodificando {total} AIFF a mp3 (cache: {audio_cache.CACHE_DIR}) ...")
    done = 0
    ex = ThreadPoolExecutor(max_workers=max_workers)
    futures = {
        ex.submit(audio_cache.transcode_track, tid, path, True): (tid, path)
        for tid, path in pending
    }
    try:
        for fut in as_completed(futures):
            done += 1
            tid, path = futures[fut]
            try:
                fut.result()
                log(f"  [{done}/{total}] {os.path.basename(path)}")
            except Exception as e:  # noqa: BLE001 - seguir con el resto
                log(f"  [{done}/{total}] ERROR {os.path.basename(path)}: {e}")
        ex.shutdown(wait=True)
        log(f"Pre-transcodificacion lista: {done}/{total}.")
    except KeyboardInterrupt:
        # El cache de lo ya hecho se conserva; al re-correr se saltan los cache hits.
        ex.shutdown(wait=False, cancel_futures=True)
        log(f"\nInterrumpido en {done}/{total}. Lo convertido queda en cache; retomas re-corriendo ingest.")
        raise
    return done


# Executor de fondo para el warming on-demand (prioridad normal). Compartido en el proceso backend.
_bg = ThreadPoolExecutor(max_workers=2, thread_name_prefix="warm")


def _warm_one(track_id):
    exists, path = get_track_file_path(track_id)
    if not exists or not path or not os.path.isfile(path):
        return
    ext = os.path.splitext(path)[1].lower()
    if ext in audio_cache.NATIVE_EXTS or not audio_cache.is_audio(ext):
        return
    try:
        audio_cache.transcode_track(track_id, path, low_priority=False)  # prioridad normal
    except Exception:  # noqa: BLE001 - best-effort; el play igual transcodifica on-demand
        pass


def warm_bg(track_ids):
    """Disparador 2 (backend): adelanta en segundo plano la conversion de esos tracks (los que
    falten). No bloquea: encola y vuelve al instante."""
    for tid in track_ids:
        _bg.submit(_warm_one, tid)
