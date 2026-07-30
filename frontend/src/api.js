// Capa de acceso al backend FastAPI. Solo lectura: consume GET /tracks.
// La URL base sale de VITE_API_URL (default: backend local en 8000).

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// Trae la biblioteca aplicando los filtros que soporta el endpoint.
// filters: { quality, collection, onlyRepresentatives }
export async function getTracks({ quality, collection, onlyRepresentatives } = {}) {
  const params = new URLSearchParams()
  if (quality) params.set('quality', quality)
  if (collection) params.set('collection', collection)
  if (onlyRepresentatives) params.set('only_representatives', 'true')

  const qs = params.toString()
  const res = await fetch(`${API_URL}/tracks${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    throw new Error(`El backend respondió ${res.status}`)
  }
  return res.json()
}

export { API_URL }
