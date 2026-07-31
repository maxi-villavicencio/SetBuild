import { useCallback, useEffect, useState } from 'react'
import { getTracks } from '../api'
import FiltersBar from './FiltersBar'
import GroupedView from './GroupedView'
import TracksTable from './TracksTable'

// Vista "Biblioteca": tabla de tracks con filtros. Vista plana o agrupada por género.
export default function LibraryView({ onStartFromTrack }) {
  const [filters, setFilters] = useState({
    quality: '',
    onlyRepresentatives: false,
  })
  const [view, setView] = useState('plana') // 'plana' | 'agrupada'
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
    <>
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        count={tracks.length}
        view={view}
        onViewChange={setView}
      />

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
        ) : view === 'plana' ? (
          <TracksTable tracks={tracks} onStartFromTrack={onStartFromTrack} />
        ) : (
          <GroupedView tracks={tracks} onStartFromTrack={onStartFromTrack} />
        ))}
    </>
  )
}
