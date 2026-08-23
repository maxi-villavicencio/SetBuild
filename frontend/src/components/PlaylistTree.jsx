// Árbol de carpetas/playlists de Rekordbox. Se renderiza RECURSIVAMENTE (soporta anidamiento
// arbitrario). Dos modos:
//   - 'single' (default): seleccionar una playlist (no usado hoy).
//   - 'multi': checkbox por nodo para armar un POOL. El pool son ids de PLAYLISTS (hojas); las
//     carpetas son agregadores: tildar/destildar una carpeta cascadea a sus descendientes, y su
//     checkbox refleja tri-estado (all=tildado, some=indeterminado, none=vacío) vía folderStateById.

function TreeNode({
  node,
  depth,
  mode,
  selectedId,
  onSelect,
  checkedIds,
  folderStateById,
  onToggleCheck,
  openFolders,
  onToggleFolder,
}) {
  const pad = { paddingLeft: `${8 + depth * 14}px` }
  const isFolder = node.node_type === 'folder'
  const isOpen = !isFolder || openFolders.has(node.rb_id)

  // Estado del checkbox: carpeta = tri-estado derivado; playlist = tildada o no.
  const folderState = isFolder ? folderStateById?.get(node.rb_id) : null
  const isChecked = isFolder ? folderState === 'all' : checkedIds?.has(node.rb_id) || false
  const isIndeterminate = isFolder && folderState === 'some'

  const checkbox =
    mode === 'multi' ? (
      <input
        type="checkbox"
        className="tree-check"
        checked={isChecked}
        ref={(el) => {
          if (el) el.indeterminate = isIndeterminate
        }}
        onChange={() => onToggleCheck(node)}
        onClick={(e) => e.stopPropagation()}
      />
    ) : null

  if (isFolder) {
    return (
      <li>
        <div className="tree-row" style={pad}>
          {checkbox}
          <button className="tree-folder" onClick={() => onToggleFolder(node.rb_id)}>
            <span className="chevron">{openFolders.has(node.rb_id) ? '▾' : '▸'}</span>
            <span className="tree-name">{node.name || '(sin nombre)'}</span>
          </button>
        </div>
        {isOpen && node.children?.length > 0 && (
          <PlaylistTree
            nodes={node.children}
            depth={depth + 1}
            mode={mode}
            selectedId={selectedId}
            onSelect={onSelect}
            checkedIds={checkedIds}
            folderStateById={folderStateById}
            onToggleCheck={onToggleCheck}
            openFolders={openFolders}
            onToggleFolder={onToggleFolder}
          />
        )}
      </li>
    )
  }

  // playlist
  return (
    <li>
      <div className="tree-row" style={pad}>
        {checkbox}
        <button
          className={`tree-playlist${!checkbox && selectedId === node.rb_id ? ' selected' : ''}`}
          onClick={() => (mode === 'multi' ? onToggleCheck(node) : onSelect(node))}
        >
          <span className="tree-name">{node.name || '(sin nombre)'}</span>
          <span className="tree-count">{node.track_count}</span>
        </button>
      </div>
    </li>
  )
}

export default function PlaylistTree({
  nodes,
  depth = 0,
  mode = 'single',
  selectedId,
  onSelect,
  checkedIds,
  folderStateById,
  onToggleCheck,
  openFolders,
  onToggleFolder,
}) {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.rb_id}
          node={node}
          depth={depth}
          mode={mode}
          selectedId={selectedId}
          onSelect={onSelect}
          checkedIds={checkedIds}
          folderStateById={folderStateById}
          onToggleCheck={onToggleCheck}
          openFolders={openFolders}
          onToggleFolder={onToggleFolder}
        />
      ))}
    </ul>
  )
}
