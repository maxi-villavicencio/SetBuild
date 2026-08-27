import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlaylists, getPoolSize, getTracks } from '../api'
import PlaylistTree from './PlaylistTree'
import TracksTable from './TracksTable'

// Junta los rb_id de todas las carpetas (para abrirlas por defecto en el árbol).
function collectFolderIds(nodes, acc = new Set()) {
  for (const n of nodes) {
    if (n.node_type === 'folder') {
      acc.add(n.rb_id)
      collectFolderIds(n.children || [], acc)
    }
  }
  return acc
}

// Junta los rb_id de todas las PLAYLISTS (hojas). El pool son ids de playlists.
function collectPlaylistIds(nodes, acc = []) {
  for (const n of nodes) {
    if (n.node_type === 'folder') collectPlaylistIds(n.children || [], acc)
    else acc.push(n.rb_id)
  }
  return acc
}

// rb_id -> nombre (para el label del pool).
function nameMap(nodes, acc = new Map()) {
  for (const n of nodes) {
    acc.set(n.rb_id, n.name || '(sin nombre)')
    if (n.children) nameMap(n.children, acc)
  }
  return acc
}

// Ids de las playlists (hojas) que cuelgan de un nodo (para el tildado en cascada de carpetas).
function leafIdsOf(node, acc = []) {
  if (node.node_type === 'folder') {
    for (const c of node.children || []) leafIdsOf(c, acc)
  } else {
    acc.push(node.rb_id)
  }
  return acc
}

// Tri-estado de cada carpeta según cuántas de sus hojas están tildadas: all | some | none.
function buildFolderStates(nodes, checkedIds, map = new Map()) {
  let total = 0
  let checked = 0
  for (const n of nodes) {
    if (n.node_type === 'folder') {
      const [t, c] = buildFolderStates(n.children || [], checkedIds, map)
      map.set(n.rb_id, c === 0 ? 'none' : c === t ? 'all' : 'some')
      total += t
      checked += c
    } else {
      total += 1
      if (checkedIds.has(n.rb_id)) checked += 1
    }
  }
  return [total, checked]
}

// Vista "Rekordbox": árbol colapsable con selección múltiple (pool). Los tracks del pool se muestran
// en UNA sola lista unificada y deduplicada (no por secciones). La selección persiste en App.
export default function RekordboxView({ filters, onStartFromTrack, onShownCount, pool, onPoolChange }) {
  const [tree, setTree] = useState([])
  const [treeStatus, setTreeStatus] = useState('loading') // loading|ok|error
  const [treeError, setTreeError] = useState(null)
  const [openFolders, setOpenFolders] = useState(() => new Set())
  const [treeOpen, setTreeOpen] = useState(false) // panel de playlists colapsado al inicio

  const [poolCount, setPoolCount] = useState(null) // tracks distintos en la unión (GET /pool)
  const [tracks, setTracks] = useState([]) // lista unificada del pool
  const [trStatus, setTrStatus] = useState('idle') // idle|loading|ok|error
  const [trError, setTrError] = useState(null)

  const poolIds = useMemo(() => pool || [], [pool])

  const loadTree = useCallback(async () => {
    setTreeStatus('loading')
    setTreeError(null)
    try {
      const data = await getPlaylists()
      setTree(data)
      setOpenFolders(collectFolderIds(data))
      setTreeStatus('ok')
    } catch (e) {
      setTreeError(e.message || 'No se pudo conectar con el backend')
      setTreeStatus('error')
    }
  }, [])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  // "Tildar todo" UNA sola vez: si el pool nunca se inicializó (null), al tener el árbol lo llenamos
  // con todas las playlists. Después es un array (aunque sea []) y no se vuelve a re-tildar.
  useEffect(() => {
    if (pool === null && treeStatus === 'ok' && tree.length > 0) {
      onPoolChange(collectPlaylistIds(tree))
    }
  }, [pool, treeStatus, tree, onPoolChange])

  const nameById = useMemo(() => nameMap(tree), [tree])
  const allPlaylistIds = useMemo(() => collectPlaylistIds(tree), [tree])
  const checkedIds = useMemo(() => new Set(poolIds), [poolIds])
  const folderStateById = useMemo(() => {
    const map = new Map()
    buildFolderStates(tree, checkedIds, map)
    return map
  }, [tree, checkedIds])

  const isWhole =
    allPlaylistIds.length > 0 &&
    checkedIds.size === allPlaylistIds.length &&
    allPlaylistIds.every((id) => checkedIds.has(id))

  const toggleCheck = useCallback(
    (node) => {
      const ids = leafIdsOf(node)
      if (ids.length === 0) return
      const set = new Set(pool || [])
      const allChecked = ids.every((id) => set.has(id))
      if (allChecked) for (const id of ids) set.delete(id)
      else for (const id of ids) set.add(id)
      onPoolChange([...set])
    },
    [pool, onPoolChange],
  )

  const toggleFolder = (rbId) =>
    setOpenFolders((prev) => {
      const next = new Set(prev)
      next.has(rbId) ? next.delete(rbId) : next.add(rbId)
      return next
    })

  // Conteo del pool (representantes distintos de la unión).
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

  // Lista unificada de tracks del pool (deduplicada: representantes de la unión de playlists).
  useEffect(() => {
    if (!poolIds.length) {
      setTracks([])
      setTrStatus('idle')
      return
    }
    let alive = true
    setTrStatus('loading')
    setTrError(null)
    getTracks({ onlyRepresentatives: true, playlistIds: poolIds })
      .then((data) => {
        if (!alive) return
        setTracks(data)
        setTrStatus('ok')
      })
      .catch((e) => {
        if (!alive) return
        setTrError(e.message || 'No se pudo conectar con el backend')
        setTrStatus('error')
      })
    return () => {
      alive = false
    }
  }, [poolIds])

  const shown = useMemo(
    () => (filters.quality ? tracks.filter((t) => t.quality === filters.quality) : tracks),
    [tracks, filters.quality],
  )

  // El contador de la barra superior muestra lo que se está viendo en la tabla.
  useEffect(() => {
    onShownCount?.(trStatus === 'ok' ? shown.length : 0)
  }, [shown, trStatus, onShownCount])

  // "Armar set desde acá" lleva el track + el pool activo. Si es toda la biblioteca (o vacío), sin pool.
  const startFromTrack = useCallback(
    (track) => {
      if (poolIds.length && !isWhole) {
        const names = poolIds.map((id) => nameById.get(id) || String(id))
        onStartFromTrack(track, { ids: poolIds, names })
      } else {
        onStartFromTrack(track, null)
      }
    },
    [onStartFromTrack, poolIds, isWhole, nameById],
  )

  const poolLabel = isWhole
    ? 'toda la biblioteca'
    : poolIds.map((id) => nameById.get(id) || id).join(', ')
  const poolCountText = poolCount != null ? `${poolCount} tracks` : poolIds.length ? '…' : '0 tracks'

  return (
    <div className="rk-view">
      <div className="rk-toolbar">
        <button
          className="ghost-btn"
          onClick={() => setTreeOpen((o) => !o)}
          aria-expanded={treeOpen}
          title={treeOpen ? 'Ocultar el panel de playlists' : 'Mostrar el panel de playlists'}
        >
          {treeOpen ? '◂ Ocultar playlists' : '▸ Playlists'}
        </button>
        <span className="rk-pool-count">Pool: {poolCountText}</span>
        {poolIds.length > 0 && <span className="dim rk-pool-names">{poolLabel}</span>}
      </div>

      <div className="rk-layout">
        {treeOpen && (
          <aside className="rk-tree">
            {treeStatus === 'loading' && <div className="state">Cargando playlists…</div>}
            {treeStatus === 'error' && (
              <div className="state error">
                <p>No se pudieron cargar las playlists: {treeError}.</p>
                <button onClick={loadTree}>Reintentar</button>
              </div>
            )}
            {treeStatus === 'ok' &&
              (tree.length === 0 ? (
                <div className="state dim">No hay playlists. Corré `import-playlists`.</div>
              ) : (
                <PlaylistTree
                  nodes={tree}
                  mode="multi"
                  checkedIds={checkedIds}
                  folderStateById={folderStateById}
                  onToggleCheck={toggleCheck}
                  openFolders={openFolders}
                  onToggleFolder={toggleFolder}
                />
              ))}
          </aside>
        )}

        <section className="rk-main">
          {poolIds.length === 0 ? (
            <div className="state dim">
              No hay playlists en el pool. Abrí “Playlists” y tildá al menos una.
            </div>
          ) : trStatus === 'loading' ? (
            <div className="state">Cargando tracks del pool…</div>
          ) : trStatus === 'error' ? (
            <div className="state error">
              <p>No se pudieron cargar los tracks: {trError}.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="state dim">
              {tracks.length === 0
                ? 'El pool no tiene tracks.'
                : 'Ningún track del pool coincide con los filtros.'}
            </div>
          ) : (
            <TracksTable tracks={shown} onStartFromTrack={startFromTrack} />
          )}
        </section>
      </div>
    </div>
  )
}
