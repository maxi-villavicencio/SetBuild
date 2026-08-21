import { useMemo } from 'react'
import { PlayButton } from '../lib/audioPlayer'
import { sortTracks, useTableSort } from '../lib/tableSort'

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

// defaultSort: orden inicial. Por defecto energía↓ (vista plana). La vista Rekordbox pasa
// { key: null } = "orden original" (respeta el orden de la playlist hasta que se clickea una columna).
export default function TracksTable({ tracks, onStartFromTrack, defaultSort }) {
  const { sort, onSort } = useTableSort(defaultSort || { key: 'energy_score', dir: 'desc' })
  const sorted = useMemo(() => sortTracks(tracks, sort, COLUMNS), [tracks, sort])

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="play-col" aria-label="Reproducir" />
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
          {sorted.map((t, i) => (
            <tr key={t.track_id}>
              <td className="play-col"><PlayButton track={t} queue={sorted} index={i} /></td>
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
