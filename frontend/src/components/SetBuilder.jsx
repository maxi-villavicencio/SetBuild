import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSet, getNextCandidates, getTracks } from '../api'
import CandidateList from './CandidateList'
import PoolSelector from './PoolSelector'
import SetTimeline from './SetTimeline'

const LIMIT = 8
const DELTA = 1.5 // cuánto sube/baja la energía objetivo al pedir "más movido/tranqui"
const clamp = (v) => Math.max(1, Math.min(10, v))

export default function SetBuilder({ seedTracks = null, onSeedConsumed }) {
  // Biblioteca (representantes) para elegir el track de arranque.
  const [allTracks, setAllTracks] = useState([])
  const [libStatus, setLibStatus] = useState('loading')
  const [query, setQuery] = useState('')

  // Set en construcción y candidatos. Si venimos con semilla (Biblioteca o set guardado), arrancamos con esos tracks.
  const [set, setSet] = useState(() => (seedTracks && seedTracks.length ? [...seedTracks] : []))
  const [energyDir, setEnergyDir] = useState('similar') // 'similar' | 'mas' | 'menos'
  const [poolIds, setPoolIds] = useState([]) // pool de armado (playlists/carpetas); [] = toda la biblioteca

  // Guardado del set.
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle') // idle|saving|ok|error
  const [saveError, setSaveError] = useState(null)

  // Consumir la semilla al montar (para que una navegación manual posterior no la reuse).
  useEffect(() => {
    if (seedTracks && seedTracks.length) onSeedConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [mode, setMode] = useState('realista')
  const [candidates, setCandidates] = useState([])
  const [candStatus, setCandStatus] = useState('idle') // idle|loading|ok|error
  const [candError, setCandError] = useState(null)

  const last = set[set.length - 1]
  const setIds = useMemo(() => new Set(set.map((t) => t.track_id)), [set])

  // Cargar la biblioteca una vez para el buscador de arranque.
  const loadLibrary = useCallback(async () => {
    setLibStatus('loading')
    try {
      const data = await getTracks({ onlyRepresentatives: true })
      setAllTracks(data)
      setLibStatus('ok')
    } catch {
      setLibStatus('error')
    }
  }, [])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  const targetEnergy = useCallback(() => {
    if (energyDir === 'similar' || last?.energy_score == null) return null
    return clamp(last.energy_score + (energyDir === 'mas' ? DELTA : -DELTA))
  }, [energyDir, last])

  // Traer candidatos para el último track cada vez que cambia el set, la energía o el modo.
  const loadCandidates = useCallback(async () => {
    if (!last) {
      setCandidates([])
      setCandStatus('idle')
      return
    }
    setCandStatus('loading')
    setCandError(null)
    try {
      const data = await getNextCandidates({
        trackId: last.track_id,
        limit: LIMIT,
        targetEnergy: targetEnergy(),
        mode,
        playlistIds: poolIds,
      })
      // no re-sugerir tracks que ya están en el set
      setCandidates(data.filter((c) => !setIds.has(c.track_id)))
      setCandStatus('ok')
    } catch (e) {
      setCandError(e.message || 'No se pudo conectar con el backend')
      setCandStatus('error')
    }
  }, [last, targetEnergy, mode, setIds, poolIds])

  useEffect(() => {
    loadCandidates()
  }, [loadCandidates])

  const pickStart = (track) => {
    setSet([track])
    setEnergyDir('similar')
    setQuery('')
  }
  const addCandidate = (track) => {
    setSet((prev) => [...prev, track])
    setEnergyDir('similar')
  }
  const undo = () => {
    setSet((prev) => prev.slice(0, -1))
    setEnergyDir('similar')
  }
  const reset = () => {
    setSet([])
    setEnergyDir('similar')
  }
  const moveUp = (i) =>
    setSet((prev) => {
      if (i <= 0) return prev
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  const moveDown = (i) =>
    setSet((prev) => {
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })

  const saveSet = async () => {
    const name = saveName.trim()
    if (!name) return
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await createSet({ name, trackIds: set.map((t) => t.track_id) })
      setSaveStatus('ok')
      setSaveOpen(false)
      setSaveName('')
    } catch (e) {
      setSaveError(e.message || 'No se pudo guardar')
      setSaveStatus('error')
    }
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allTracks
      .filter(
        (t) =>
          (t.title || '').toLowerCase().includes(q) ||
          (t.artist || '').toLowerCase().includes(q),
      )
      .slice(0, 20)
  }, [query, allTracks])

  const canNudge = last?.energy_score != null

  return (
    <div className="builder">
      <PoolSelector poolIds={poolIds} onChange={setPoolIds} />

      {set.length === 0 ? (
        <div className="start-picker">
          <h2>Elegí el track de arranque</h2>
          {libStatus === 'loading' && <div className="state">Cargando biblioteca…</div>}
          {libStatus === 'error' && (
            <div className="state error">
              <p>No se pudo cargar la biblioteca.</p>
              <button onClick={loadLibrary}>Reintentar</button>
            </div>
          )}
          {libStatus === 'ok' && (
            <>
              <input
                className="search"
                type="text"
                placeholder="Buscar por título o artista…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query.trim() && (
                <ul className="start-results">
                  {results.length === 0 && <li className="dim no-res">Sin coincidencias</li>}
                  {results.map((t) => (
                    <li key={t.track_id}>
                      <button className="start-row" onClick={() => pickStart(t)}>
                        <span className="mono cand-meta">{t.bpm != null ? t.bpm.toFixed(1) : '—'}</span>
                        <span className="mono cand-meta">{t.camelot || '—'}</span>
                        <span className="mono cand-meta">
                          {t.energy_score != null ? t.energy_score.toFixed(1) : '—'}
                        </span>
                        <span className="cand-title">
                          {t.title || <span className="dim">—</span>}
                          <span className="dim"> — {t.artist || '—'}</span>
                        </span>
                        <span className="chip genre">{t.genre_canonical || 'sin clasificar'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="builder-toolbar">
            {!saveOpen ? (
              <button
                className="ghost-btn"
                onClick={() => {
                  setSaveOpen(true)
                  setSaveStatus('idle')
                }}
              >
                💾 Guardar set
              </button>
            ) : (
              <form
                className="save-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveSet()
                }}
              >
                <input
                  className="search"
                  type="text"
                  placeholder="Nombre del set…"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="ghost-btn"
                  disabled={saveStatus === 'saving' || !saveName.trim()}
                >
                  {saveStatus === 'saving' ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setSaveOpen(false)
                    setSaveName('')
                  }}
                >
                  Cancelar
                </button>
              </form>
            )}
            {saveStatus === 'ok' && <span className="save-ok">Guardado ✓</span>}
            {saveStatus === 'error' && (
              <span className="save-err">No se pudo guardar: {saveError}</span>
            )}
          </div>

          <div className="builder-grid">
            <SetTimeline set={set} onUndo={undo} onMoveUp={moveUp} onMoveDown={moveDown} />

          <section className="next-panel">
            <div className="next-head">
              <h2>Siguiente track</h2>
              <button className="ghost-btn" onClick={reset}>Empezar de nuevo</button>
            </div>

            <div className="controls">
              <div className="segmented" role="group" aria-label="Energía objetivo">
                <button
                  className={energyDir === 'menos' ? 'on' : ''}
                  onClick={() => setEnergyDir('menos')}
                  disabled={!canNudge}
                  title={canNudge ? '' : 'El track actual no tiene energía'}
                >
                  ▼ más tranqui
                </button>
                <button
                  className={energyDir === 'similar' ? 'on' : ''}
                  onClick={() => setEnergyDir('similar')}
                >
                  ≈ similar
                </button>
                <button
                  className={energyDir === 'mas' ? 'on' : ''}
                  onClick={() => setEnergyDir('mas')}
                  disabled={!canNudge}
                  title={canNudge ? '' : 'El track actual no tiene energía'}
                >
                  ▲ más movido
                </button>
              </div>

              <label className="mode-field">
                Modo
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="realista">Realista</option>
                  <option value="limpio">Limpio</option>
                </select>
              </label>
            </div>

            <CandidateList
              status={candStatus}
              error={candError}
              candidates={candidates}
              onPick={addCandidate}
              onRetry={loadCandidates}
            />
          </section>
          </div>
        </>
      )}
    </div>
  )
}
