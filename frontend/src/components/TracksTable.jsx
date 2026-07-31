import { useMemo, useState } from 'react'

// Columnas de la tabla. `num` marca las numéricas (orden numérico + alineadas a la derecha).
const COLUMNS = [
  { key: 'title', label: 'Título' },
  { key: 'artist', label: 'Artista' },
  { key: 'bpm', label: 'BPM', num: true },
  { key: 'camelot', label: 'Camelot' },
  { key: 'energy_score', label: 'Energía', num: true },
  { key: 'quality', label: 'Calidad' },
  { key: 'genre_canonical', label: 'Género' },
]

// Comparador que manda los nulos al final en ambas direcciones.
function compare(a, b, key, num, dir) {
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  let r
  if (num) r = va - vb
  else r = String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' })
  return dir === 'asc' ? r : -r
}

export default function TracksTable({ tracks, onStartFromTrack }) {
  const [sort, setSort] = useState({ key: 'energy_score', dir: 'desc' })

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key)
    return [...tracks].sort((a, b) => compare(a, b, sort.key, col?.num, sort.dir))
  }, [tracks, sort])

  const onSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={c.num ? 'num' : undefined}
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
          {sorted.map((t) => (
            <tr key={t.track_id}>
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
              <td>{t.genre_canonical || <span className="dim">sin clasificar</span>}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
