// Barra de reproducción fija al pie. Solo se muestra cuando hay un track cargado
// (si no, devuelve null y no ocupa espacio). Reusa el AudioProvider: play/pausa, seek
// clickeable, sig/ant según el contexto (la lista de donde salió el track), e info del track.
// El hueco de la carátula queda listo con un placeholder (la imagen real es un próximo sprint).
import { useAudio } from '../lib/audioPlayer'
import { fmtDuration } from '../lib/format'

export default function PlayerBar() {
  const {
    current,
    isPlaying,
    loadingId,
    errorId,
    currentTime,
    duration,
    playPause,
    seek,
    next,
    prev,
    stop,
    hasPrev,
    hasNext,
  } = useAudio()

  if (!current) return null

  const id = current.track_id
  const isLoading = loadingId === id
  const isError = errorId === id
  const dur = duration || current.duration_sec || 0
  const pct = dur > 0 ? Math.min(100, (currentTime / dur) * 100) : 0

  const onSeek = (e) => {
    if (!dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, frac)) * dur)
  }

  const playTitle = isError
    ? 'No se pudo reproducir'
    : isLoading
      ? 'Preparando…'
      : isPlaying
        ? 'Pausar'
        : 'Reproducir'

  return (
    <div className="player-bar" role="region" aria-label="Reproductor">
      <div className="pb-info">
        {/* Placeholder de carátula — el hueco queda listo para la imagen real (próximo sprint). */}
        <div className="pb-cover" aria-hidden="true">♪</div>
        <div className="pb-text">
          <span className="pb-title" title={current.title || ''}>{current.title || '—'}</span>
          <span className="pb-artist" title={current.artist || ''}>{current.artist || '—'}</span>
        </div>
      </div>

      <div className="pb-center">
        <div className="pb-controls">
          <button
            className="pb-btn"
            onClick={prev}
            disabled={!hasPrev}
            title="Anterior"
            aria-label="Anterior"
          >
            ⏮
          </button>
          <button
            className={'pb-btn pb-play' + (isError ? ' err' : '')}
            onClick={playPause}
            disabled={isError}
            title={playTitle}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isError ? '⚠' : isLoading ? <span className="spinner" /> : isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="pb-btn"
            onClick={next}
            disabled={!hasNext}
            title="Siguiente"
            aria-label="Siguiente"
          >
            ⏭
          </button>
        </div>

        <div className="pb-progress">
          <span className="pb-time mono">{fmtDuration(currentTime)}</span>
          <div
            className="pb-track"
            onClick={onSeek}
            role="slider"
            aria-label="Progreso"
            aria-valuemin={0}
            aria-valuemax={Math.round(dur)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
          >
            <div className="pb-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="pb-time mono">{dur ? fmtDuration(dur) : '—'}</span>
        </div>
      </div>

      <button className="pb-close" onClick={stop} title="Cerrar" aria-label="Cerrar reproductor">
        ✕
      </button>
    </div>
  )
}
