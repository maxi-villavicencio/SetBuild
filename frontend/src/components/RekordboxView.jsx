import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlaylists, getPlaylistTracks } from '../api'
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

// Vista "Rekordbox": el arbol de carpetas/playlists + los tracks de la playlist elegida, en orden.
export default function RekordboxView({ filters, onStartFromTrack, onShownCount }) {
  const [tree, setTree] = useState([])
  const [treeStatus, setTreeStatus] = useState('loading') // loading|ok|error
  const [treeError, setTreeError] = useState(null)
  const [openFolders, setOpenFolders] = useState(() => new Set())

  const [selected, setSelected] = useState(null)
  const [tracks, setTracks] = useState([])
  const [trStatus, setTrStatus] = useState('idle') // idle|loading|ok|error
  const [trError, setTrError] = useState(null)

  const loadTree = useCallback(async () => {
    setTreeStatus('loading')
    setTreeError(null)
    try {
      const data = await getPlaylists()
      setTree(data)
      setOpenFolders(collectFolderIds(data)) // carpetas abiertas por defecto
      setTreeStatus('ok')
    } catch (e) {
      setTreeError(e.message || 'No se pudo conectar con el backend')
      setTreeStatus('error')
    }
  }, [])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  const selectPlaylist = useCallback(async (node) => {
    setSelected(node)
    setTrStatus('loading')
    setTrError(null)
    try {
      const data = await getPlaylistTracks(node.rb_id)
      setTracks(data)
      setTrStatus('ok')
    } catch (e) {
      setTrError(e.message || 'No se pudieron cargar los tracks')
      setTrStatus('error')
    }
  }, [])

  const toggleFolder = (rbId) =>
    setOpenFolders((prev) => {
      const next = new Set(prev)
      next.has(rbId) ? next.delete(rbId) : next.add(rbId)
      return next
    })

  // Filtro client-side sobre los tracks de la playlist: SOLO calidad. "Solo representantes" NO se
  // aplica aca a proposito: esta vista muestra las playlists TAL CUAL en Rekordbox (sin colapsar dups).
  const filtered = useMemo(
    () => (filters.quality ? tracks.filter((t) => t.quality === filters.quality) : tracks),
    [tracks, filters.quality],
  )

  useEffect(() => {
    onShownCount?.(trStatus === 'ok' ? filtered.length : 0)
  }, [filtered, trStatus, onShownCount])

  return (
    <div className="rk-layout">
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
              selectedId={selected?.rb_id}
              onSelect={selectPlaylist}
              openFolders={openFolders}
              onToggleFolder={toggleFolder}
            />
          ))}
      </aside>

      <section className="rk-main">
        {!selected && <div className="state dim">Elegí una playlist para ver sus tracks.</div>}
        {selected && (
          <>
            <div className="rk-playlist-head">
              <h2>{selected.name || '(sin nombre)'}</h2>
              {trStatus === 'ok' && (
                <span className="dim">
                  {filtered.length}
                  {filtered.length !== tracks.length ? ` de ${tracks.length}` : ''} tracks
                </span>
              )}
            </div>
            {trStatus === 'loading' && <div className="state">Cargando tracks…</div>}
            {trStatus === 'error' && (
              <div className="state error">
                <p>No se pudieron cargar los tracks: {trError}.</p>
                <button onClick={() => selectPlaylist(selected)}>Reintentar</button>
              </div>
            )}
            {trStatus === 'ok' &&
              (filtered.length === 0 ? (
                <div className="state dim">
                  {tracks.length === 0
                    ? 'Esta playlist está vacía (o sus tracks no están en la biblioteca).'
                    : 'Ningún track coincide con los filtros.'}
                </div>
              ) : (
                // key={rb_id}: cada playlist tiene su propio orden; defaultSort null = orden de Rekordbox.
                <TracksTable
                  key={selected.rb_id}
                  tracks={filtered}
                  onStartFromTrack={onStartFromTrack}
                  defaultSort={{ key: null, dir: 'asc' }}
                />
              ))}
          </>
        )}
      </section>
    </div>
  )
}
