import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { audioUrl } from '../api'

// Reproductor de audio compartido: un solo <audio> para toda la app, así suena un track a la vez.
const AudioCtx = createContext(null)

export function AudioProvider({ children }) {
  const audioRef = useRef(null)
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio()
  }
  const currentRef = useRef(null) // track_id cargado en el <audio>
  const [playingId, setPlayingId] = useState(null) // sonando de verdad
  const [loadingId, setLoadingId] = useState(null) // elegido, preparando (ej. transcodificando AIFF)
  const [errorId, setErrorId] = useState(null)      // audio que falló (404 / 503 / error)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onPlaying = () => {
      setLoadingId(null)
      setErrorId(null)
      setPlayingId(currentRef.current)
    }
    const onEnded = () => {
      setPlayingId(null)
      setLoadingId(null)
      currentRef.current = null
    }
    const onError = () => {
      const id = currentRef.current
      setPlayingId(null)
      setLoadingId(null)
      if (id != null) setErrorId(id)
      currentRef.current = null
    }
    a.addEventListener('playing', onPlaying)
    a.addEventListener('ended', onEnded)
    a.addEventListener('error', onError)
    return () => {
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('error', onError)
      a.pause()
    }
  }, [])

  const toggle = useCallback((trackId) => {
    const a = audioRef.current
    if (!a) return
    // click sobre el track actual (sonando o preparando) -> lo corta
    if (currentRef.current === trackId) {
      a.pause()
      setPlayingId(null)
      setLoadingId(null)
      currentRef.current = null
      return
    }
    setErrorId(null)
    setPlayingId(null)
    setLoadingId(trackId) // spinner hasta que el evento 'playing' confirme que arrancó
    currentRef.current = trackId
    a.src = audioUrl(trackId)
    a.play().catch(() => {
      if (currentRef.current === trackId) {
        setLoadingId(null)
        setPlayingId(null)
        setErrorId(trackId)
        currentRef.current = null
      }
    })
  }, [])

  return (
    <AudioCtx.Provider value={{ playingId, loadingId, errorId, toggle }}>
      {children}
    </AudioCtx.Provider>
  )
}

export function useAudio() {
  return useContext(AudioCtx)
}

// Botón play/pausa por track. stopPropagation para no disparar el click de la fila/candidato.
export function PlayButton({ trackId }) {
  const { playingId, loadingId, errorId, toggle } = useAudio()
  const isPlaying = playingId === trackId
  const isLoading = loadingId === trackId
  const isError = errorId === trackId
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
        toggle(trackId)
      }}
      title={title}
      aria-label={title}
    >
      {isError ? '⚠' : isLoading ? <span className="spinner" /> : isPlaying ? '⏸' : '▶'}
    </button>
  )
}
