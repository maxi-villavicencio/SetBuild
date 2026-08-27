import { useCallback, useEffect, useState } from 'react'
import { getTracks } from '../api'
import FiltersBar from './FiltersBar'
import GroupedView from './GroupedView'
import RekordboxView from './RekordboxView'
import TracksTable from './TracksTable'

// Vista "Biblioteca" con 3 vistas: Rekordbox (default), Por género y Plana.
// filtros y vista vienen de App (persistidos); los tracks/estados de carga son locales.
export default function LibraryView({
  onStartFromTrack,
  filters,
  onFiltersChange,
  view,
  onViewChange,
  rkPool,
  onRkPoolChange,
}) {
  const setFilters = onFiltersChange
  const setView = onViewChange
  const [tracks, setTracks] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [error, setError] = useState(null)
  const [rkCount, setRkCount] = useState(0) // conteo mostrado en la vista Rekordbox

  // getTracks (server-side) solo para plana/agrupada; Rekordbox trae su data de los endpoints de playlists.
  const load = useCallback(async () => {
    if (view === 'rekordbox') return
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
  }, [filters, view])

  useEffect(() => {
    load()
  }, [load])

  const count = view === 'rekordbox' ? rkCount : tracks.length

  return (
    <>
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        count={count}
        view={view}
        onViewChange={setView}
      />

      {view === 'rekordbox' ? (
        <RekordboxView
          filters={filters}
          onStartFromTrack={onStartFromTrack}
          onShownCount={setRkCount}
          pool={rkPool}
          onPoolChange={onRkPoolChange}
        />
      ) : (
        <>
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
              <TracksTable tracks={tracks} onStartFromTrack={onStartFromTrack} storageKey="plana" />
            ) : (
              <GroupedView tracks={tracks} onStartFromTrack={onStartFromTrack} />
            ))}
        </>
      )}
    </>
  )
}
