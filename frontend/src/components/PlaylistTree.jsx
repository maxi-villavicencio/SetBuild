// Árbol de carpetas/playlists de Rekordbox. Se renderiza RECURSIVAMENTE: un TreeNode que, si es
// carpeta, vuelve a dibujar sus children con PlaylistTree -> soporta anidamiento arbitrario.

function TreeNode({ node, depth, selectedId, onSelect, openFolders, onToggleFolder }) {
  const pad = { paddingLeft: `${8 + depth * 14}px` }

  if (node.node_type === 'folder') {
    const isOpen = openFolders.has(node.rb_id)
    return (
      <li>
        <button className="tree-folder" style={pad} onClick={() => onToggleFolder(node.rb_id)}>
          <span className="chevron">{isOpen ? '▾' : '▸'}</span>
          <span className="tree-name">{node.name || '(sin nombre)'}</span>
        </button>
        {isOpen && node.children?.length > 0 && (
          <PlaylistTree
            nodes={node.children}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
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
      <button
        className={`tree-playlist${selectedId === node.rb_id ? ' selected' : ''}`}
        style={pad}
        onClick={() => onSelect(node)}
      >
        <span className="tree-name">{node.name || '(sin nombre)'}</span>
        <span className="tree-count">{node.track_count}</span>
      </button>
    </li>
  )
}

export default function PlaylistTree({
  nodes,
  depth = 0,
  selectedId,
  onSelect,
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
          selectedId={selectedId}
          onSelect={onSelect}
          openFolders={openFolders}
          onToggleFolder={onToggleFolder}
        />
      ))}
    </ul>
  )
}
