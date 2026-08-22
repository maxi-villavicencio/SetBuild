import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPlaylists, getPlaylistTracks, getPoolSize } from '../api'
import PlaylistTree from './PlaylistTree'
import TracksTable from './TracksTable'

// Junta los rb_id de todas las carpetas (para abrirlas por defecto).
function collectFolderIds(nodes, acc = new Set()) {
  for (const n of nodes) {
    if (n.node_type === 'folder') {
      acc.add(n.rb_id)
      collectFolderIds(n.children || [], acc)
    }
  }
  return acc
}

// Junta los rb_id de todas las PLAYLISTS (hojas). Se usa para "tildar todo" al inicio.
function collectPlaylistIds(nodes, acc = []) {
  for (const n of nodes) {
    if (n.node_type === 'folder') collectPlaylistIds(n.children || [], acc)
    else acc.push(n.rb_id)
  }
  return acc
}

// rb_id -> nombre, para mostrar los nombres del pool seleccionado.
function nameMap(nodes, acc = new Map()) {
  for (const n of nodes) {
    acc.set(n.rb_id, n.name || '(sin nombre)')
    if (n.children) nameMap(n.children, acc)
  }
  return acc
}

// Resuelve la selección (que puede incluir carpetas) a la lista de PLAYLISTS a mostrar, en orden
// del árbol y sin duplicados: una playlist entra si está tildada o si una carpeta ancestro lo está.
function collectDisplayPlaylists(nodes, checkedIds, ancestorChecked, out = []) {
  for (const n of nodes) {
    const isChecked = checkedIds.has(n.rb_id)
    if (n.node_type === 'folder') {
      collectDisplayPlaylists(n.children || [], checkedIds, ancestorChecked || isChecked, out)
    } else if (ancestorChecked || isChecked) {
      out.push(n)
    }
  }
  return out
}

// Vista "Rekordbox": árbol de carpetas/playlists COLAPSABLE (prioridad a la tabla) con selección
// múltiple para definir el POOL de armado. Arranca colapsada y con todo tildado (toda la biblioteca).
export default function RekordboxView({ filters, onStartFromTrack, onShownCount }) {
  const [tree, setTree] = useState([])
  const [treeStatus, setTreeStatus] = useState('loading') // loading|ok|error
  const [treeError, setTreeError] = useState(null)
  const [openFolders, setOpenFolders] = useState(() => new Set())
  const [treeOpen, setTreeOpen] = useState(false) // panel de playlists colapsado al inicio

  const [poolIds, setPoolIds] = useState([])   // playlists/carpetas tildadas (el pool)
  const [poolCount, setPoolCount] = useState(null) // tracks distintos en la unión (GET /pool)
  const [sections, setSections] = useState({}) // rb_id -> { status, tracks, error } (cache)
  const [collapsed, setCollapsed] = useState(() => new Set()) // secciones plegadas (vacío = todas abiertas)

  const initedRef = useRef(false) // para tildar todo una sola vez tras la primera carga

  const loadTree = useCallback(async () => {
    setTreeStatus('loading')
    setTreeError(null)
    try {
      const data = await getPlaylists()
      setTree(data)
      setOpenFolders(collectFolderIds(data)) // carpetas abiertas por defecto
      // Estado inicial: todo tildado (pool = toda la biblioteca), una sola vez.
      if (!initedRef.current) {
        setPoolIds(collectPlaylistIds(data))
        initedRef.current = true
      }
      setTreeStatus('ok')
    } catch (e) {
      setTreeError(e.message || 'No se pudo conectar con el backend')
      setTreeStatus('error')
    }
  }, [])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  const nameById = useMemo(() => nameMap(tree), [tree])
  const allPlaylistIds = useMemo(() => collectPlaylistIds(tree), [tree])
  const checkedIds = useMemo(() => new Set(poolIds), [poolIds])
  const displayPlaylists = useMemo(
    () => collectDisplayPlaylists(tree, checkedIds, false),
    [tree, checkedIds],
  )

  // ¿El pool es toda la biblioteca? (todas las playlists tildadas). Se usa para el label y para no
  // arrastrar un pool "gigante" a Armar set cuando en realidad no hay restricción.
  const isWhole =
    allPlaylistIds.length > 0 &&
    checkedIds.size === allPlaylistIds.length &&
    allPlaylistIds.every((id) => checkedIds.has(id))

  const toggleCheck = (rbId) =>
    setPoolIds((prev) => (prev.includes(rbId) ? prev.filter((x) => x !== rbId) : [...prev, rbId]))
  const toggleFolder = (rbId) =>
    setOpenFolders((prev) => {
      const next = new Set(prev)
      next.has(rbId) ? next.delete(rbId) : next.add(rbId)
      return next
    })
  const toggleSection = (rbId) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(rbId) ? next.delete(rbId) : next.add(rbId)
      return next
    })

  // Conteo del pool (representantes distintos de la unión; carpetas expandidas por el backend).
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

  // Carga (en paralelo) los tracks de cada playlist a mostrar que aún no estén en cache.
  useEffect(() => {
    const missing = displayPlaylists.map((p) => p.rb_id).filter((id) => !sections[id])
    if (missing.length === 0) return
    let alive = true
    setSections((prev) => {
      const next = { ...prev }
      for (const id of missing) next[id] = { status: 'loading', tracks: [], error: null }
      return next
    })
    missing.forEach(async (id) => {
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
  }, [displayPlaylists])

  // El contador de la barra superior muestra el tamaño del pool (distintos).
  useEffect(() => {
    onShownCount?.(poolCount || 0)
  }, [poolCount, onShownCount])

  // "Armar set desde acá" lleva el track de arranque + el pool activo. Si el pool es toda la
  // biblioteca (o está vacío), va sin pool (null): no hay restricción real que arrastrar.
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

  const poolLabel = isWhole ? 'toda la biblioteca' : poolIds.map((id) => nameById.get(id) || id).join(', ')
  const poolCountText =
    poolCount != null ? `${poolCount} tracks` : poolIds.length ? '…' : '0 tracks'

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
              const isOpen = !collapsed.has(pl.rb_id)
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
                    (sec?.status === 'loading' ? (
                      <div className="state">Cargando tracks…</div>
                    ) : sec?.status === 'error' ? (
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
