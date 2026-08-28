import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSet, getNextCandidates, getPoolSize, getTracks } from '../api'
import CandidateList from './CandidateList'
import SetTimeline from './SetTimeline'

// El set en construcción, el modo y el pool son CONTROLADOS por App (persisten al navegar y al F5).
// Lo efímero (biblioteca del buscador, candidatos, guardado) queda local.
export default function SetBuilder({ set, onSetChange, mode, onModeChange, pool, onPoolChange }) {
  const setSet = onSetChange
  const setMode = onModeChange

  // Biblioteca (representantes) para elegir el track de arranque.
  const [allTracks, setAllTracks] = useState([])
  const [libStatus, setLibStatus] = useState('loading')
  const [query, setQuery] = useState('')

  // Pool de armado (playlists/carpetas); [] = toda la biblioteca. Viene de la vista Rekordbox.
  const poolIds = useMemo(() => pool?.ids || [], [pool])
  const poolNames = pool?.names || []
  const [poolCount, setPoolCount] = useState(null)

  // Guardado del set.
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle') // idle|saving|ok|error
  const [saveError, setSaveError] = useState(null)

  const [candidates, setCandidates] = useState([])
  const [candStatus, setCandStatus] = useState('idle') // idle|loading|ok|error
  const [candError, setCandError] = useState(null)

  const last = set[set.length - 1]
  const setIds = useMemo(() => new Set(set.map((t) => t.track_id)), [set])

  // Conteo del pool activo (para el indicador discreto). [] = toda la biblioteca -> sin conteo.
  useEffect(() => {
    if (!poolIds.length) {
      setPoolCount(null)
      return
    }
    let alive = true
    getPoolSize(poolIds)
      .then((r) => alive && setPoolCount(r.track_count))
      .catch(() => alive && setPoolCount(null))
    return () => {
      alive = false
    }
  }, [poolIds])

  // Limpiar el pool sin salir de Armar set: vuelve a toda la biblioteca.
  const clearPool = () => onPoolChange(null)

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

  // Candidatos para el ÚLTIMO track del set. Sin límite y sin energía objetivo: el backend ordena
  // por cercanía de energía al track actual (suave/seguro arriba, movido/+7 abajo).
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
  }, [last, mode, setIds, poolIds])

  useEffect(() => {
    loadCandidates()
  }, [loadCandidates])

  const pickStart = (track) => {
    setSet([track])
    setQuery('')
  }
  const addCandidate = (track) => setSet((prev) => [...prev, track])
  const undo = () => setSet((prev) => prev.slice(0, -1))
  const reset = () => setSet([])
  // Quitar CUALQUIER track del set (no re-encadena; los candidatos se recalculan sobre el nuevo último).
  const removeAt = (i) => setSet((prev) => prev.filter((_, idx) => idx !== i))
  // Reordenar por drag & drop: mueve el track de `from` a `to`.
  const reorder = (from, to) =>
    setSet((prev) => {
      if (from === to || from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
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

  return (
    <div className="builder">
      {poolIds.length > 0 && (
        <div className="pool-bar">
          <span className="pool-label">Pool:</span>
          <span className="pool-value">{poolNames.join(', ') || `${poolIds.length} seleccionadas`}</span>
          {poolCount != null && <span className="pool-count">— {poolCount} tracks</span>}
          <div className="spacer" />
          <button className="ghost-btn" onClick={clearPool} title="Volver a toda la biblioteca">
            Limpiar pool
          </button>
        </div>
      )}

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
            <SetTimeline set={set} onUndo={undo} onRemove={removeAt} onReorder={reorder} />

            <section className="next-panel">
              <div className="next-head">
                <h2>Siguiente track</h2>
                <button className="ghost-btn" onClick={reset}>Empezar de nuevo</button>
              </div>

              <div className="controls">
                <label className="mode-field">
                  Modo
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="limpio">Lossless</option>
                    <option value="realista">Compressed</option>
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
