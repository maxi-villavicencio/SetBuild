import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlaylists, getPlaylistTracks, getPoolSize } from '../api'
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

// Ids de las playlists (hojas) que cuelgan de un nodo (para el tildado en cascada de carpetas).
function leafIdsOf(node, acc = []) {
  if (node.node_type === 'folder') {
    for (const c of node.children || []) leafIdsOf(c, acc)
  } else {
    acc.push(node.rb_id)
  }
  return acc
}

// Playlists tildadas, en orden del árbol (para mostrar y para los nombres del pool).
function collectCheckedPlaylists(nodes, checkedIds, out = []) {
  for (const n of nodes) {
    if (n.node_type === 'folder') collectCheckedPlaylists(n.children || [], checkedIds, out)
    else if (checkedIds.has(n.rb_id)) out.push(n)
  }
  return out
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

// Vista "Rekordbox": árbol colapsable con selección múltiple (pool) y carga DIFERIDA de tracks.
// La selección (pool) vive en App (props pool/onPoolChange) para persistir entre vistas/pestañas.
export default function RekordboxView({ filters, onStartFromTrack, onShownCount, pool, onPoolChange }) {
  const [tree, setTree] = useState([])
  const [treeStatus, setTreeStatus] = useState('loading') // loading|ok|error
  const [treeError, setTreeError] = useState(null)
  const [openFolders, setOpenFolders] = useState(() => new Set())
  const [treeOpen, setTreeOpen] = useState(false) // panel de playlists colapsado al inicio

  const [poolCount, setPoolCount] = useState(null) // tracks distintos en la unión (GET /pool)
  const [sections, setSections] = useState({}) // rb_id -> { status, tracks, error } (cache en memoria)
  const [openSections, setOpenSections] = useState(() => new Set()) // secciones expandidas (vacío = plegadas)

  const poolIds = useMemo(() => pool || [], [pool])

  const loadTree = useCallback(async () => {
    setTreeStatus('loading')
    setTreeError(null)
    try {
      const data = await getPlaylists()
      setTree(data)
      setOpenFolders(collectFolderIds(data)) // carpetas abiertas por defecto en el árbol
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

  const allPlaylistIds = useMemo(() => collectPlaylistIds(tree), [tree])
  const checkedIds = useMemo(() => new Set(poolIds), [poolIds])
  const displayPlaylists = useMemo(
    () => collectCheckedPlaylists(tree, checkedIds),
    [tree, checkedIds],
  )
  const folderStateById = useMemo(() => {
    const map = new Map()
    buildFolderStates(tree, checkedIds, map)
    return map
  }, [tree, checkedIds])

  const isWhole =
    allPlaylistIds.length > 0 &&
    checkedIds.size === allPlaylistIds.length &&
    allPlaylistIds.every((id) => checkedIds.has(id))

  // Tildar/destildar un nodo: playlist = su id; carpeta = cascada a todas sus hojas.
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
  const toggleSection = (rbId) =>
    setOpenSections((prev) => {
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

  // Carga DIFERIDA: pide los tracks de una sección recién cuando se abre, y los cachea.
  useEffect(() => {
    const toLoad = [...openSections].filter((id) => !sections[id])
    if (toLoad.length === 0) return
    let alive = true
    setSections((prev) => {
      const next = { ...prev }
      for (const id of toLoad) next[id] = { status: 'loading', tracks: [], error: null }
      return next
    })
    toLoad.forEach(async (id) => {
      try {
        const data = await getPlaylistTracks(id)
        if (alive) setSections((prev) => ({ ...prev, [id]: { status: 'ok', tracks: data, error: null } }))
      } catch (e) {
        if (alive)
          setSections((prev) => ({
            ...prev,
            [id]: { status: 'error', tracks: [], error: e.message || 'error' },
          }))
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSections])

  // El contador de la barra superior muestra el tamaño del pool (distintos).
  useEffect(() => {
    onShownCount?.(poolCount || 0)
  }, [poolCount, onShownCount])

  // "Armar set desde acá" lleva el track + el pool activo. Si es toda la biblioteca (o vacío), sin pool.
  const startFromTrack = useCallback(
    (track) => {
      if (poolIds.length && !isWhole) {
        const names = displayPlaylists.map((p) => p.name || '(sin nombre)')
        onStartFromTrack(track, { ids: poolIds, names })
      } else {
        onStartFromTrack(track, null)
      }
    },
    [onStartFromTrack, poolIds, isWhole, displayPlaylists],
  )

  const poolLabel = isWhole
    ? 'toda la biblioteca'
    : displayPlaylists.map((p) => p.name || '(sin nombre)').join(', ')
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
          ) : displayPlaylists.length === 0 ? (
            <div className="state dim">La selección no tiene playlists con tracks (¿carpeta vacía?).</div>
          ) : (
            displayPlaylists.map((pl) => {
              const sec = sections[pl.rb_id]
              const isOpen = openSections.has(pl.rb_id)
              const all = sec?.tracks || []
              const shown = filters.quality ? all.filter((t) => t.quality === filters.quality) : all
              return (
                <section className="genre-folder" key={pl.rb_id}>
                  <button
                    className="folder-head"
                    onClick={() => toggleSection(pl.rb_id)}
                    aria-expanded={isOpen}
                  >
                    <span className="chevron">{isOpen ? '▾' : '▸'}</span>
                    <span className="folder-name">{pl.name || '(sin nombre)'}</span>
                    <span className="folder-count">{pl.track_count}</span>
                  </button>
                  {isOpen &&
                    (!sec || sec.status === 'loading' ? (
                      <div className="state">Cargando tracks…</div>
                    ) : sec.status === 'error' ? (
                      <div className="state error">
                        <p>No se pudieron cargar los tracks: {sec.error}.</p>
                      </div>
                    ) : shown.length === 0 ? (
                      <div className="state dim">
                        {all.length === 0
                          ? 'Esta playlist está vacía (o sus tracks no están en la biblioteca).'
                          : 'Ningún track coincide con los filtros.'}
                      </div>
                    ) : (
                      // defaultSort null = orden original de la playlist (Rekordbox).
                      <TracksTable
                        key={pl.rb_id}
                        tracks={shown}
                        onStartFromTrack={startFromTrack}
                        defaultSort={{ key: null, dir: 'asc' }}
                      />
                    ))}
                </section>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
