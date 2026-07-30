// Barra de filtros: mapea 1:1 con lo que soporta GET /tracks.
export default function FiltersBar({ filters, onChange, count, total }) {
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

      <div className="field">
        <label htmlFor="f-collection">Colección</label>
        <select
          id="f-collection"
          value={filters.collection}
          onChange={(e) => set({ collection: e.target.value })}
        >
          <option value="">Todas</option>
          <option value="Maxi">Maxi</option>
          <option value="Zoe">Zoe</option>
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

      <div className="counter">
        Viendo <strong>{count}</strong>
        {total != null && total !== count ? <> de {total}</> : null} tracks
      </div>
    </div>
  )
}
