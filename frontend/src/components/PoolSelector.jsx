import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlaylists, getPoolSize } from '../api'
import PlaylistTree from './PlaylistTree'

function collectFolderIds(nodes, acc = new Set()) {
  for (const n of nodes) {
    if (n.node_type === 'folder') {
      acc.add(n.rb_id)
      collectFolderIds(n.children || [], acc)
    }
  }
  return acc
}

function nameMap(nodes, acc = new Map()) {
  for (const n of nodes) {
    acc.set(n.rb_id, n.name || '(sin nombre)')
    if (n.children) nameMap(n.children, acc)
  }
  return acc
}

// Selector de POOL de armado: elegir playlists/carpetas de Rekordbox para acotar los candidatos.
export default function PoolSelector({ poolIds, onChange }) {
  const [open, setOpen] = useState(false)
  const [tree, setTree] = useState([])
  const [status, setStatus] = useState('loading') // loading|ok|error
  const [openFolders, setOpenFolders] = useState(() => new Set())
  const [count, setCount] = useState(null)

  const loadTree = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await getPlaylists()
      setTree(data)
      setOpenFolders(collectFolderIds(data))
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  // Tamaño del pool seleccionado.
  useEffect(() => {
    if (!poolIds.length) {
      setCount(null)
      return
    }
    let alive = true
    getPoolSize(poolIds)
      .then((r) => alive && setCount(r.track_count))
      .catch(() => alive && setCount(null))
    return () => {
      alive = false
    }
  }, [poolIds])

  const names = useMemo(() => nameMap(tree), [tree])
  const checkedIds = useMemo(() => new Set(poolIds), [poolIds])

  const toggleCheck = (rbId) =>
    onChange(poolIds.includes(rbId) ? poolIds.filter((x) => x !== rbId) : [...poolIds, rbId])
  const toggleFolder = (rbId) =>
    setOpenFolders((prev) => {
      const next = new Set(prev)
      next.has(rbId) ? next.delete(rbId) : next.add(rbId)
      return next
    })

  const selectedNames = poolIds.map((id) => names.get(id) || id).join(', ')

  return (
    <>
      <div className="pool-bar">
        <span className="pool-label">Pool:</span>
        {poolIds.length === 0 ? (
          <span className="pool-value">toda la biblioteca</span>
        ) : (
          <>
            <span className="pool-value">{selectedNames}</span>
            {count != null && <span className="pool-count">— {count} tracks</span>}
          </>
        )}
        <div className="spacer" />
        <button className="ghost-btn" onClick={() => setOpen((o) => !o)}>
          {open ? 'Cerrar' : poolIds.length ? 'Cambiar' : 'Elegir pool'}
        </button>
        {poolIds.length > 0 && (
          <button className="ghost-btn" onClick={() => onChange([])}>
            Limpiar
          </button>
        )}
      </div>

      {open && (
        <div className="pool-panel">
          {status === 'loading' && <div className="state">Cargando playlists…</div>}
          {status === 'error' && (
            <div className="state error">
              <p>No se pudieron cargar las playlists.</p>
              <button onClick={loadTree}>Reintentar</button>
            </div>
          )}
          {status === 'ok' && (
            <PlaylistTree
              nodes={tree}
              mode="multi"
              checkedIds={checkedIds}
              onToggleCheck={toggleCheck}
              openFolders={openFolders}
              onToggleFolder={toggleFolder}
            />
          )}
        </div>
      )}
    </>
  )
}
