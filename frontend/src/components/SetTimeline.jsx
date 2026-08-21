// Muestra el set en construcción (orden, BPM/key/energía/género), su duración total,
// una curva de energía, reorden por flechas y deshacer.
import { PlayButton } from '../lib/audioPlayer'
import { fmtDuration } from '../lib/format'

function EnergyCurve({ set }) {
  const W = 520
  const H = 60
  const pad = 6
  const pts = set
    .map((t, i) => ({ i, e: t.energy_score }))
    .filter((p) => p.e != null)
  if (pts.length < 2) return null

  const x = (i) => pad + (set.length === 1 ? 0 : (i / (set.length - 1)) * (W - 2 * pad))
  const y = (e) => H - pad - (e / 10) * (H - 2 * pad)
  const line = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.e).toFixed(1)}`).join(' ')

  return (
    <svg className="energy-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.e)} r="3" fill="var(--accent)" />
      ))}
    </svg>
  )
}

export default function SetTimeline({ set, onUndo, onMoveUp, onMoveDown }) {
  const totalSec = set.reduce((acc, t) => acc + (t.duration_sec || 0), 0)

  return (
    <section className="timeline">
      <div className="timeline-head">
        <h2>
          Set en construcción <span className="dim">({set.length})</span>
          {totalSec > 0 && <span className="dim"> · {fmtDuration(totalSec)}</span>}
        </h2>
        <button className="ghost-btn" onClick={onUndo} disabled={set.length === 0}>
          ↶ Deshacer último
        </button>
      </div>

      <EnergyCurve set={set} />

      <ol className="set-list">
        {set.map((t, i) => (
          <li key={`${t.track_id}-${i}`}>
            <span className="pos mono">{i + 1}</span>
            <PlayButton track={t} queue={set} index={i} />
            <span className="set-title">
              <span className="set-track-title">{t.title || '—'}</span>
              <span className="set-sub dim">
                {t.artist || '—'} · {t.genre_canonical || 'sin clasificar'}
              </span>
            </span>
            <span className="mono set-meta">{t.bpm != null ? t.bpm.toFixed(1) : '—'}</span>
            <span className="mono set-meta">{t.camelot || '—'}</span>
            <span className="set-energy">
              <span className="energy-bar">
                <span style={{ width: `${((t.energy_score ?? 0) / 10) * 100}%` }} />
              </span>
              <span className="mono">{t.energy_score != null ? t.energy_score.toFixed(1) : '—'}</span>
            </span>
            <span className="reorder">
              <button onClick={() => onMoveUp(i)} disabled={i === 0} title="Subir" aria-label="Subir">
                ↑
              </button>
              <button
                onClick={() => onMoveDown(i)}
                disabled={i === set.length - 1}
                title="Bajar"
                aria-label="Bajar"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
