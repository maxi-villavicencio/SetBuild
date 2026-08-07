"""Preparacion del audio para reproducir en el navegador.

Formatos que el navegador YA reproduce (mp3/wav/flac/m4a) se sirven DIRECTO (sin tocar el
original). Los que no (aiff/aif) se transcodifican a mp3 con ffmpeg y se cachean en .audio_cache/.

Invariante: el archivo ORIGINAL nunca se modifica (solo se lee). La conversion va al cache.
Invalidacion simple: la clave de cache incluye mtime+size del original -> si cambia, se regenera.
"""
import glob
import os
import shutil
import subprocess
import sys
import threading
import uuid
from pathlib import Path

# Formatos que el navegador reproduce nativamente -> se sirven directo.
NATIVE_EXTS = {".mp3", ".wav", ".flac", ".m4a"}

# Todos los tipos de audio que soportamos (para Content-Type y validacion).
AUDIO_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
}

CACHE_DIR = Path(__file__).resolve().parent.parent / ".audio_cache"
_TRANSCODE_TIMEOUT = 180  # segundos


class FfmpegNotAvailable(Exception):
    """ffmpeg no esta instalado y hace falta para transcodificar."""


class TranscodeError(Exception):
    """Fallo la conversion con ffmpeg."""


def is_audio(ext):
    return ext.lower() in AUDIO_TYPES


def ffmpeg_path():
    """Ruta al binario ffmpeg, o None si no esta en el PATH."""
    return shutil.which("ffmpeg")


def cache_target(track_id, src_path):
    """Path del mp3 cacheado para la clave vigente (mtime+size del original -> invalidacion)."""
    st = os.stat(src_path)
    key = f"{track_id}-{int(st.st_mtime)}-{st.st_size}"
    return CACHE_DIR / f"{key}.mp3"


def is_cached(track_id, src_path):
    """True si el track no requiere conversion (nativo) o su mp3 cacheado vigente ya existe."""
    ext = os.path.splitext(src_path)[1].lower()
    if ext in NATIVE_EXTS:
        return True
    try:
        return cache_target(track_id, src_path).exists()
    except OSError:
        return False


# Un lock por track: evita que dentro del MISMO proceso (play + warming) se convierta dos veces.
_locks = {}
_locks_guard = threading.Lock()


def _lock_for(track_id):
    with _locks_guard:
        return _locks.setdefault(track_id, threading.Lock())


def transcode_track(track_id, src_path, low_priority=False):
    """Asegura el mp3 cacheado del track (idempotente: si ya esta, no rehace). Devuelve el path
    a servir (el original si es nativo). Lanza FfmpegNotAvailable / TranscodeError.

    Es la unica ruta de transcodificacion; la usan prepare_playable, la masiva y el warming."""
    ext = os.path.splitext(src_path)[1].lower()
    if ext in NATIVE_EXTS:
        return src_path

    ff = ffmpeg_path()
    if not ff:
        raise FfmpegNotAvailable()

    target = cache_target(track_id, src_path)
    if target.exists():
        return str(target)  # cache hit
    with _lock_for(track_id):
        if target.exists():  # otro thread lo hizo mientras esperabamos el lock
            return str(target)
        _transcode_to_mp3(ff, src_path, target, track_id, low_priority=low_priority)
    return str(target)


def prepare_playable(track_id, src_path):
    """Devuelve (path_a_servir, media_type) para el <audio>. Nativos -> original; no-nativos ->
    mp3 cacheado (transcodificando si hace falta)."""
    ext = os.path.splitext(src_path)[1].lower()
    if ext in NATIVE_EXTS:
        return (src_path, AUDIO_TYPES[ext])
    return (transcode_track(track_id, src_path), "audio/mpeg")


def _transcode_to_mp3(ff, src, target, track_id, low_priority=False):
    CACHE_DIR.mkdir(exist_ok=True)
    # tmp UNICO por invocacion: dos procesos (ingest + backend) convirtiendo el mismo track no se
    # pisan el temporal; cada uno hace su os.replace atomico al mismo destino final.
    tmp = f"{target}.{os.getpid()}-{uuid.uuid4().hex[:8]}.tmp"
    # -vn + -map 0:a:0: ignora carátulas embebidas (stream de video mjpeg en varios AIFF de Soundeo).
    # -f mp3: fuerza el muxer mp3 (el temporal termina en .tmp, ffmpeg no puede inferirlo por extension).
    cmd = [ff, "-y", "-i", src, "-vn", "-map", "0:a:0",
           "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", tmp]
    kwargs = {}
    if low_priority and sys.platform == "win32":
        kwargs["creationflags"] = getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0x00004000)
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=_TRANSCODE_TIMEOUT, **kwargs)
    except subprocess.TimeoutExpired:
        _safe_remove(tmp)
        raise TranscodeError("ffmpeg tardo demasiado (timeout).")
    if proc.returncode != 0 or not os.path.exists(tmp):
        _safe_remove(tmp)
        msg = proc.stderr.decode(errors="ignore")[-400:] if proc.stderr else "error desconocido"
        raise TranscodeError(msg)
    os.replace(tmp, target)  # atomico: nunca se sirve un archivo a medio escribir
    _cleanup_old_versions(track_id, target)


def _cleanup_old_versions(track_id, keep):
    """Borra versiones viejas del mismo track (mtime/size anteriores)."""
    for f in glob.glob(str(CACHE_DIR / f"{track_id}-*.mp3")):
        if os.path.abspath(f) != os.path.abspath(str(keep)):
            _safe_remove(f)


def _safe_remove(path):
    try:
        os.remove(path)
    except OSError:
        pass
