import { useCallback, useEffect, useState } from 'react'
import { API_URL, deleteSet, getSet, listSets } from '../api'
import { fmtDuration } from '../lib/format'

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

// Vista "Mis sets": lista los sets guardados y permite abrirlos o borrarlos.
export default function MySets({ onOpenSet }) {
  const [sets, setSets] = useState([])
  const [status, setStatus] = useState('loading') // loading|ok|error
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)   // set abriéndose/borrándose
  const [confirmId, setConfirmId] = useState(null) // set con confirmación de borrado pendiente

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      setSets(await listSets())
      setStatus('ok')
    } catch (e) {
      setError(e.message || 'No se pudo conectar con el backend')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = async (id) => {
    setBusyId(id)
    setError(null)
    try {
      const detail = await getSet(id)
      onOpenSet(detail.tracks)
    } catch (e) {
      setError(e.message || 'No se pudo abrir el set')
      setBusyId(null)
    }
  }

  const remove = async (id) => {
    setBusyId(id)
    setError(null)
    try {
      await deleteSet(id)
      setConfirmId(null)
      await load()
    } catch (e) {
      setError(e.message || 'No se pudo borrar el set')
    } finally {
      setBusyId(null)
    }
  }

  if (status === 'loading') return <div className="state">Cargando sets…</div>
  if (status === 'error') {
    return (
      <div className="state error">
        <p>No se pudieron cargar los sets: {error}.</p>
        <button onClick={load}>Reintentar</button>
      </div>
    )
  }
  if (sets.length === 0) {
    return <div className="state">Todavía no guardaste ningún set. Armá uno en "Armar set" y guardalo.</div>
  }

  return (
    <div className="my-sets">
      {error && <div className="state error">{error}</div>}
      <ul className="set-cards">
        {sets.map((s) => (
          <li className="set-card" key={s.set_id}>
            <div className="set-card-info">
              <span className="set-card-name">{s.name || <span className="dim">(sin nombre)</span>}</span>
              <span className="set-card-meta dim">
                {s.track_count} tracks · {fmtDuration(s.duration_sec)} · {fmtDate(s.created_at)}
              </span>
            </div>
            <div className="set-card-actions">
              {confirmId === s.set_id ? (
                <>
                  <span className="dim">¿Borrar?</span>
                  <button
                    className="ghost-btn danger"
                    onClick={() => remove(s.set_id)}
                    disabled={busyId === s.set_id}
                  >
                    {busyId === s.set_id ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                  <button className="ghost-btn" onClick={() => setConfirmId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="ghost-btn"
                    onClick={() => open(s.set_id)}
                    disabled={busyId === s.set_id}
                  >
                    {busyId === s.set_id ? 'Abriendo…' : 'Abrir'}
                  </button>
                  <a
                    className="ghost-btn"
                    href={`${API_URL}/sets/${s.set_id}/export.xml`}
                    title="Descargar XML para importar en Rekordbox"
                  >
                    Exportar a Rekordbox (.xml)
                  </a>
                  <button className="ghost-btn danger" onClick={() => setConfirmId(s.set_id)}>
                    Borrar
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
