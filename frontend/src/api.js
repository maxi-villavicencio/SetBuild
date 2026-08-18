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

// Candidatos para el siguiente track del set, dado el track actual.
// opts: { trackId, limit, targetEnergy, mode, playlistIds }
export async function getNextCandidates({ trackId, limit, targetEnergy, mode, playlistIds } = {}) {
  const params = new URLSearchParams()
  params.set('track_id', String(trackId))
  if (limit) params.set('limit', String(limit))
  if (targetEnergy != null) params.set('target_energy', String(targetEnergy))
  if (mode) params.set('mode', mode)
  for (const id of playlistIds || []) params.append('playlist_ids', String(id))

  const res = await fetch(`${API_URL}/next-candidates?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`El backend respondió ${res.status}`)
  }
  return res.json()
}

// Cantidad de tracks en el pool de las playlists/carpetas seleccionadas.
export async function getPoolSize(playlistIds) {
  const params = new URLSearchParams()
  for (const id of playlistIds || []) params.append('playlist_ids', String(id))
  const res = await fetch(`${API_URL}/pool?${params.toString()}`)
  if (!res.ok) throw new Error(`El backend respondió ${res.status}`)
  return res.json() // { track_count }
}

// --- Sets guardados ---

export async function createSet({ name, trackIds }) {
  const res = await fetch(`${API_URL}/sets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, track_ids: trackIds }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail || `El backend respondió ${res.status}`)
  }
  return res.json()
}

export async function listSets() {
  const res = await fetch(`${API_URL}/sets`)
  if (!res.ok) throw new Error(`El backend respondió ${res.status}`)
  return res.json()
}

export async function getSet(setId) {
  const res = await fetch(`${API_URL}/sets/${setId}`)
  if (!res.ok) throw new Error(`El backend respondió ${res.status}`)
  return res.json()
}

export async function deleteSet(setId) {
  const res = await fetch(`${API_URL}/sets/${setId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`El backend respondió ${res.status}`)
  return res.json()
}

// URL del audio local de un track (para el elemento <audio>).
export function audioUrl(trackId) {
  return `${API_URL}/tracks/${trackId}/audio`
}

// --- Playlists de Rekordbox (Sprint 21) ---

export async function getPlaylists() {
  const res = await fetch(`${API_URL}/playlists`)
  if (!res.ok) throw new Error(`El backend respondió ${res.status}`)
  return res.json()
}

export async function getPlaylistTracks(rbId) {
  const res = await fetch(`${API_URL}/playlists/${rbId}/tracks`)
  if (!res.ok) throw new Error(`El backend respondió ${res.status}`)
  return res.json()
}

export { API_URL }
