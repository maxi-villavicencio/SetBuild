import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { audioUrl } from '../api'

// Reproductor de audio compartido: un solo <audio> para toda la app, así suena un track a la vez.
// Además del play/pausa por fila, mantiene el CONTEXTO de reproducción (la lista de donde salió
// el track + el índice) para que el sig/ant recorran esa misma lista.
const AudioCtx = createContext(null)

export function AudioProvider({ children }) {
  const audioRef = useRef(null)
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio()
  }
  const currentRef = useRef(null) // track_id cargado en el <audio>
  const queueRef = useRef([])     // lista de contexto (objetos track) de donde salió el play
  const indexRef = useRef(-1)     // posición del track actual dentro de la lista

  const [current, setCurrent] = useState(null)      // objeto track cargado (la barra se ve si != null)
  const [playingId, setPlayingId] = useState(null)  // sonando de verdad
  const [loadingId, setLoadingId] = useState(null)  // elegido, preparando (ej. transcodificando AIFF)
  const [errorId, setErrorId] = useState(null)      // audio que falló (404 / 503 / error)
  const [isPlaying, setIsPlaying] = useState(false) // play vs pausa del track cargado
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ctx, setCtx] = useState({ len: 0, index: -1 }) // para derivar hasPrev/hasNext

  // startTrack se referencia desde el listener 'ended' (registrado una vez) sin recrear el efecto.
  const startTrackRef = useRef(null)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onPlaying = () => {
      setLoadingId(null)
      setErrorId(null)
      setPlayingId(currentRef.current)
      setIsPlaying(true)
    }
    const onPause = () => setIsPlaying(false)
    const onTime = () => setCurrentTime(a.currentTime || 0)
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0)
    const onEnded = () => {
      // auto-avanzar al siguiente del contexto; si no hay, queda en pausa al final
      if (indexRef.current >= 0 && indexRef.current < queueRef.current.length - 1) {
        const nextIdx = indexRef.current + 1
        startTrackRef.current?.(queueRef.current[nextIdx], queueRef.current, nextIdx)
      } else {
        setPlayingId(null)
        setIsPlaying(false)
      }
    }
    const onError = () => {
      const id = currentRef.current
      setPlayingId(null)
      setLoadingId(null)
      setIsPlaying(false)
      if (id != null) setErrorId(id)
    }
    a.addEventListener('playing', onPlaying)
    a.addEventListener('pause', onPause)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnded)
    a.addEventListener('error', onError)
    return () => {
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('error', onError)
      a.pause()
    }
  }, [])

  // Carga y reproduce un track junto con su contexto (lista + índice). No alterna: siempre arranca.
  const startTrack = useCallback((track, queue, index) => {
    const a = audioRef.current
    if (!a || !track) return
    const list = Array.isArray(queue) ? queue : []
    const idx = typeof index === 'number' ? index : -1
    queueRef.current = list
    indexRef.current = idx
    currentRef.current = track.track_id
    setCurrent(track)
    setCtx({ len: list.length, index: idx })
    setErrorId(null)
    setPlayingId(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(track.duration_sec || 0) // provisorio hasta que 'loadedmetadata' dé el real
    setLoadingId(track.track_id)          // spinner hasta que 'playing' confirme que arrancó
    a.src = audioUrl(track.track_id)
    a.play().catch(() => {
      if (currentRef.current === track.track_id) {
        setLoadingId(null)
        setPlayingId(null)
        setIsPlaying(false)
        setErrorId(track.track_id)
      }
    })
  }, [])
  startTrackRef.current = startTrack

  // API para los botones de fila: si es el track ya cargado, alterna pausa/reanudar; si no, arranca.
  const play = useCallback((track, queue, index) => {
    const a = audioRef.current
    if (!a || !track) return
    if (currentRef.current === track.track_id) {
      if (a.paused) a.play().catch(() => {})
      else a.pause()
      return
    }
    startTrack(track, queue, index)
  }, [startTrack])

  const playPause = useCallback(() => {
    const a = audioRef.current
    if (!a || currentRef.current == null) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }, [])

  const seek = useCallback((t) => {
    const a = audioRef.current
    if (!a || !Number.isFinite(t)) return
    try {
      a.currentTime = Math.max(0, t)
      setCurrentTime(a.currentTime)
    } catch {
      /* todavía sin metadata: se ignora */
    }
  }, [])

  const next = useCallback(() => {
    if (indexRef.current >= 0 && indexRef.current < queueRef.current.length - 1) {
      const idx = indexRef.current + 1
      startTrack(queueRef.current[idx], queueRef.current, idx)
    }
  }, [startTrack])

  const prev = useCallback(() => {
    if (indexRef.current > 0) {
      const idx = indexRef.current - 1
      startTrack(queueRef.current[idx], queueRef.current, idx)
    }
  }, [startTrack])

  // Cierra la barra: pausa y limpia el estado (deja de ocupar espacio).
  const stop = useCallback(() => {
    const a = audioRef.current
    if (a) a.pause()
    currentRef.current = null
    queueRef.current = []
    indexRef.current = -1
    setCurrent(null)
    setPlayingId(null)
    setLoadingId(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setCtx({ len: 0, index: -1 })
  }, [])

  const hasPrev = ctx.index > 0
  const hasNext = ctx.index >= 0 && ctx.index < ctx.len - 1

  return (
    <AudioCtx.Provider
      value={{
        current,
        playingId,
        loadingId,
        errorId,
        isPlaying,
        currentTime,
        duration,
        play,
        playPause,
        seek,
        next,
        prev,
        stop,
        hasPrev,
        hasNext,
      }}
    >
      {children}
    </AudioCtx.Provider>
  )
}

export function useAudio() {
  return useContext(AudioCtx)
}

// Botón play/pausa por track. Recibe el objeto track + la lista de contexto (queue) y su índice,
// para que el reproductor sepa de qué lista salió y el sig/ant la recorran. stopPropagation para
// no disparar el click de la fila/candidato.
export function PlayButton({ track, queue, index }) {
  const { playingId, loadingId, errorId, play } = useAudio()
  const id = track.track_id
  const isPlaying = playingId === id
  const isLoading = loadingId === id
  const isError = errorId === id
  const title = isError
    ? 'No se pudo reproducir (archivo no encontrado o error al preparar el audio)'
    : isLoading
      ? 'Preparando…'
      : isPlaying
        ? 'Pausar'
        : 'Reproducir'
  return (
    <button
      type="button"
      className={
        'play-btn' +
        (isPlaying ? ' playing' : '') +
        (isLoading ? ' loading' : '') +
        (isError ? ' err' : '')
      }
      onClick={(e) => {
        e.stopPropagation()
        play(track, queue, index)
      }}
      title={title}
      aria-label={title}
    >
      {isError ? '⚠' : isLoading ? <span className="spinner" /> : isPlaying ? '⏸' : '▶'}
    </button>
  )
}
