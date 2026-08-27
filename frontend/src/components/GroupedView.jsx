import { useMemo, useState } from 'react'
import { PlayButton } from '../lib/audioPlayer'
import { sortTracks, useTableSort } from '../lib/tableSort'

const UNCLASSIFIED = 'sin clasificar'

// Columnas de la tabla dentro de cada carpeta (sin "Género", implícito en la carpeta).
const GROUPED_COLUMNS = [
  { key: 'title', label: 'Título', cls: 'c-title' },
  { key: 'artist', label: 'Artista', cls: 'c-artist' },
  { key: 'bpm', label: 'BPM', num: true, cls: 'c-bpm' },
  { key: 'camelot', label: 'Camelot', cls: 'c-cam' },
  { key: 'energy_score', label: 'Energía', num: true, cls: 'c-energy' },
  { key: 'quality', label: 'Calidad', cls: 'c-qual' },
]

function TrackRow({ t, queue, index, onStartFromTrack }) {
  return (
    <tr>
      <td className="play-col"><PlayButton track={t} queue={queue} index={index} /></td>
      <td title={t.title || ''}>{t.title || <span className="dim">—</span>}</td>
      <td title={t.artist || ''}>{t.artist || <span className="dim">—</span>}</td>
      <td className="num mono">{t.bpm != null ? t.bpm.toFixed(1) : '—'}</td>
      <td className="mono">{t.camelot || <span className="dim">—</span>}</td>
      <td className="num">
        {t.energy_score != null ? (
          <span className="energy-cell">
            <span className="energy-bar">
              <span style={{ width: `${(t.energy_score / 10) * 100}%` }} />
            </span>
            <span className="mono">{t.energy_score.toFixed(1)}</span>
          </span>
        ) : (
          <span className="dim">—</span>
        )}
      </td>
      <td>
        {t.quality ? (
          <span className={`badge ${t.quality}`}>{t.quality}</span>
        ) : (
          <span className="dim">—</span>
        )}
      </td>
      <td className="action-col">
        <button
          className="row-action"
          onClick={() => onStartFromTrack?.(t)}
          title="Armar set desde acá"
        >
          ▶ Armar set
        </button>
      </td>
    </tr>
  )
}

// Cada carpeta tiene su PROPIO estado de orden (independiente de las demás).
function GenreFolder({ genre, items, isOpen, onToggle, onStartFromTrack }) {
  const { sort, onSort } = useTableSort({ key: 'energy_score', dir: 'desc' })
  const sorted = useMemo(() => sortTracks(items, sort, GROUPED_COLUMNS), [items, sort])

  return (
    <section className="genre-folder">
      <button className="folder-head" onClick={onToggle} aria-expanded={isOpen}>
        <span className="chevron">{isOpen ? '▾' : '▸'}</span>
        <span className="folder-name">{genre}</span>
        <span className="folder-count">{items.length}</span>
      </button>
      {isOpen && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="play-col" aria-label="Reproducir" />
                {GROUPED_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={[c.num && 'num', c.cls].filter(Boolean).join(' ') || undefined}
                    onClick={() => onSort(c.key)}
                    title="Ordenar"
                  >
                    {c.label}
                    {sort.key === c.key && (
                      <span className="arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
                <th className="action-col" aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => (
                <TrackRow
                  key={t.track_id}
                  t={t}
                  queue={sorted}
                  index={i}
                  onStartFromTrack={onStartFromTrack}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function GroupedView({ tracks, onStartFromTrack }) {
  // Agrupar por género; "sin clasificar" (None) va al final. Carpetas ordenadas por cantidad desc.
  const groups = useMemo(() => {
    const byGenre = new Map()
    for (const t of tracks) {
      const key = t.genre_canonical || UNCLASSIFIED
      if (!byGenre.has(key)) byGenre.set(key, [])
      byGenre.get(key).push(t)
    }
    const arr = [...byGenre.entries()].map(([genre, items]) => ({ genre, items }))
    arr.sort((a, b) => {
      if (a.genre === UNCLASSIFIED) return 1
      if (b.genre === UNCLASSIFIED) return -1
      return b.items.length - a.items.length
    })
    return arr
  }, [tracks])

  const [open, setOpen] = useState(() => new Set())
  const toggle = (genre) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(genre) ? next.delete(genre) : next.add(genre)
      return next
    })

  return (
    <div className="grouped">
      {groups.map(({ genre, items }) => (
        <GenreFolder
          key={genre}
          genre={genre}
          items={items}
          isOpen={open.has(genre)}
          onToggle={() => toggle(genre)}
          onStartFromTrack={onStartFromTrack}
        />
      ))}
    </div>
  )
}
