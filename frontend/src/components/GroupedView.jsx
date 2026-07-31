import { useMemo, useState } from 'react'

const UNCLASSIFIED = 'sin clasificar'

// Filas ordenadas por energía desc (nulos al final), dentro de cada carpeta.
function byEnergyDesc(a, b) {
  if (a.energy_score == null && b.energy_score == null) return 0
  if (a.energy_score == null) return 1
  if (b.energy_score == null) return -1
  return b.energy_score - a.energy_score
}

function TrackRow({ t, onStartFromTrack }) {
  return (
    <tr>
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

export default function GroupedView({ tracks, onStartFromTrack }) {
  // Agrupar por género; "sin clasificar" (None) va al final. Carpetas ordenadas por cantidad desc.
  const groups = useMemo(() => {
    const byGenre = new Map()
    for (const t of tracks) {
      const key = t.genre_canonical || UNCLASSIFIED
      if (!byGenre.has(key)) byGenre.set(key, [])
      byGenre.get(key).push(t)
    }
    const arr = [...byGenre.entries()].map(([genre, items]) => ({
      genre,
      items: [...items].sort(byEnergyDesc),
    }))
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
      {groups.map(({ genre, items }) => {
        const isOpen = open.has(genre)
        return (
          <section className="genre-folder" key={genre}>
            <button className="folder-head" onClick={() => toggle(genre)} aria-expanded={isOpen}>
              <span className="chevron">{isOpen ? '▾' : '▸'}</span>
              <span className="folder-name">{genre}</span>
              <span className="folder-count">{items.length}</span>
            </button>
            {isOpen && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Artista</th>
                      <th className="num">BPM</th>
                      <th>Camelot</th>
                      <th className="num">Energía</th>
                      <th>Calidad</th>
                      <th className="action-col" aria-label="Acción" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => (
                      <TrackRow key={t.track_id} t={t} onStartFromTrack={onStartFromTrack} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
