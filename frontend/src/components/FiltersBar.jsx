// Barra de filtros: mapea 1:1 con lo que soporta GET /tracks. Incluye el toggle de vista.
export default function FiltersBar({ filters, onChange, count, total, view, onViewChange }) {
  const set = (patch) => onChange({ ...filters, ...patch })

  return (
    <div className="filters">
      <div className="field">
        <label htmlFor="f-quality">Calidad</label>
        <select
          id="f-quality"
          value={filters.quality}
          onChange={(e) => set({ quality: e.target.value })}
        >
          <option value="">Todas</option>
          <option value="lossless">Lossless</option>
          <option value="compressed">Compressed</option>
        </select>
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={filters.onlyRepresentatives}
          onChange={(e) => set({ onlyRepresentatives: e.target.checked })}
        />
        Solo representantes (sin duplicados)
      </label>

      <div className="spacer" />

      {onViewChange && (
        <div className="segmented" role="group" aria-label="Vista">
          <button
            className={view === 'plana' ? 'on' : ''}
            onClick={() => onViewChange('plana')}
          >
            Plana
          </button>
          <button
            className={view === 'agrupada' ? 'on' : ''}
            onClick={() => onViewChange('agrupada')}
          >
            Por género
          </button>
        </div>
      )}

      <div className="counter">
        Viendo <strong>{count}</strong>
        {total != null && total !== count ? <> de {total}</> : null} tracks
      </div>
    </div>
  )
}
