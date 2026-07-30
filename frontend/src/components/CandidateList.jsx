// Lista de candidatos para el siguiente track. Click en uno lo agrega al set.

function ReasonChips({ reasons }) {
  return (
    <span className="reasons">
      {reasons.map((r) => (
        <span key={r} className={`chip ${r === 'misma key' ? 'key' : ''}`}>{r}</span>
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
    return <div className="state">No hay candidatos compatibles. Probá otro modo o energía.</div>
  }

  return (
    <ul className="candidates">
      {candidates.map((c) => (
        <li key={c.track_id}>
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
            <ReasonChips reasons={c.reasons || []} />
            <span className="add-hint">+ agregar</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
