import { PlayButton } from '../lib/audioPlayer'

// Lista de candidatos para el siguiente track. Click en uno lo agrega al set.

// Transiciones armónicas "seguras" vs el energy boost (+7), que se resalta distinto.
const SAFE_KEY_REASONS = new Set([
  'misma key',
  'key adyacente (+1)',
  'key adyacente (-1)',
  'relativo mayor/menor',
])

function chipClass(r) {
  if (r === 'energy boost (+7)') return 'chip boost'
  if (SAFE_KEY_REASONS.has(r)) return 'chip key'
  return 'chip'
}

function ReasonChips({ genre, reasons }) {
  return (
    <span className="reasons">
      <span className="chip genre">{genre || 'sin clasificar'}</span>
      {reasons.map((r) => (
        <span key={r} className={chipClass(r)}>{r}</span>
      ))}
    </span>
  )
}

export default function CandidateList({ status, error, candidates, onPick, onRetry }) {
  if (status === 'loading') return <div className="state">Buscando candidatos…</div>

  if (status === 'error') {
    return (
      <div className="state error">
        <p>No se pudieron cargar los candidatos: {error}.</p>
        <button onClick={onRetry}>Reintentar</button>
      </div>
    )
  }

  if (status === 'ok' && candidates.length === 0) {
    return (
      <div className="state">
        Sin candidatos compatibles — cargá más tracks de este género o cambiá el track anterior.
      </div>
    )
  }

  return (
    <>
      <div className="cand-count dim">
        {candidates.length} {candidates.length === 1 ? 'candidato' : 'candidatos'}
      </div>
      <ul className="candidates">
      {candidates.map((c, i) => (
        <li key={c.track_id} className="cand-row">
          <PlayButton track={c} queue={candidates} index={i} />
          <button className="cand" onClick={() => onPick(c)} title="Agregar al set">
            <span className="mono cand-meta">{c.bpm != null ? c.bpm.toFixed(1) : '—'}</span>
            <span className="mono cand-meta">{c.camelot || '—'}</span>
            <span className="cand-energy">
              <span className="energy-bar">
                <span style={{ width: `${((c.energy_score ?? 0) / 10) * 100}%` }} />
              </span>
              <span className="mono">{c.energy_score != null ? c.energy_score.toFixed(1) : '—'}</span>
            </span>
            <span className="cand-title">
              {c.title || <span className="dim">—</span>}
              <span className="dim"> — {c.artist || '—'}</span>
            </span>
            <ReasonChips genre={c.genre_canonical} reasons={c.reasons || []} />
            <span className="add-hint">+ agregar</span>
          </button>
        </li>
      ))}
      </ul>
    </>
  )
}
