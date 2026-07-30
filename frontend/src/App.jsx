import { useCallback, useEffect, useState } from 'react'
import { getTracks } from './api'
import FiltersBar from './components/FiltersBar'
import TracksTable from './components/TracksTable'
import './App.css'

export default function App() {
  const [filters, setFilters] = useState({
    quality: '',
    collection: '',
    onlyRepresentatives: false,
  })
  const [tracks, setTracks] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const data = await getTracks(filters)
      setTracks(data)
      setStatus('ok')
    } catch (e) {
      setError(e.message || 'No se pudo conectar con el backend')
      setStatus('error')
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="app">
      <header className="app-header">
        <h1>DJ Set Builder — Biblioteca</h1>
        <span className="subtitle">Vista de solo lectura de tu colección</span>
      </header>

      <FiltersBar filters={filters} onChange={setFilters} count={tracks.length} />

      {status === 'loading' && <div className="state">Cargando biblioteca…</div>}

      {status === 'error' && (
        <div className="state error">
          <p>No se pudo cargar la biblioteca: {error}.</p>
          <p className="dim">¿Está corriendo el backend (uvicorn app.main:app)?</p>
          <button onClick={load}>Reintentar</button>
        </div>
      )}

      {status === 'ok' &&
        (tracks.length === 0 ? (
          <div className="state">No hay tracks para estos filtros.</div>
        ) : (
          <TracksTable tracks={tracks} />
        ))}
    </div>
  )
}
