// Árbol de carpetas/playlists de Rekordbox. Se renderiza RECURSIVAMENTE (soporta anidamiento
// arbitrario). Dos modos:
//   - 'single' (default): seleccionar una playlist (vista Rekordbox).
//   - 'multi': checkbox por nodo para armar un POOL (marcar carpeta = el backend la expande).

function TreeNode({
  node,
  depth,
  mode,
  selectedId,
  onSelect,
  checkedIds,
  onToggleCheck,
  openFolders,
  onToggleFolder,
}) {
  const pad = { paddingLeft: `${8 + depth * 14}px` }
  const isFolder = node.node_type === 'folder'
  const isOpen = !isFolder || openFolders.has(node.rb_id)
  const checkbox =
    mode === 'multi' ? (
      <input
        type="checkbox"
        className="tree-check"
        checked={checkedIds?.has(node.rb_id) || false}
        onChange={() => onToggleCheck(node.rb_id)}
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
          onClick={() => (mode === 'multi' ? onToggleCheck(node.rb_id) : onSelect(node))}
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
          onToggleCheck={onToggleCheck}
          openFolders={openFolders}
          onToggleFolder={onToggleFolder}
        />
      ))}
    </ul>
  )
}
