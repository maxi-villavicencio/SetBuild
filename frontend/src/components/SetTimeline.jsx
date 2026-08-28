// Muestra el set en construcción (orden, BPM/key/energía/género), su duración total, una curva de
// energía, reorden por DRAG & DROP (@dnd-kit) y borrado por fila. "Deshacer último" queda como atajo.
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

// Fila ordenable: la manija (⠿) inicia el drag; el resto de la fila queda clickeable (play, quitar).
function SortableRow({ t, i, set, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.track_id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 2 : undefined,
  }
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'set-row dragging' : 'set-row'}>
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        title="Arrastrar para reordenar"
        aria-label="Arrastrar para reordenar"
      >
        ⠿
      </button>
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
      <button
        className="set-remove"
        onClick={() => onRemove(i)}
        title="Quitar del set"
        aria-label="Quitar del set"
      >
        ✕
      </button>
    </li>
  )
}

export default function SetTimeline({ set, onUndo, onRemove, onReorder }) {
  const totalSec = set.reduce((acc, t) => acc + (t.duration_sec || 0), 0)
  const ids = set.map((t) => t.track_id)

  // Un pequeño umbral de movimiento evita que un click en la manija dispare un drag accidental.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id)
    const to = ids.indexOf(over.id)
    if (from !== -1 && to !== -1) onReorder(from, to)
  }

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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="set-list">
            {set.map((t, i) => (
              <SortableRow key={t.track_id} t={t} i={i} set={set} onRemove={onRemove} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  )
}
