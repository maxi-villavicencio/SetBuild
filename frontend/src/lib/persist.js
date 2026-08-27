import { useEffect, useState } from 'react'

// Persistencia de estado en localStorage, tolerante a datos viejos/corruptos.
// Prefijo versionado: si algún día cambia el formato, se sube la versión y lo viejo se ignora.
const PREFIX = 'setbuild.v1.'

function load(key, validate, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    const val = JSON.parse(raw)
    if (typeof validate === 'function' && !validate(val)) return fallback
    return val
  } catch {
    // JSON inválido, localStorage deshabilitado, etc. -> arrancamos limpio.
    return fallback
  }
}

// Igual que useState, pero rehidrata desde localStorage al montar y persiste en cada cambio.
// Si `key` es falsy, se comporta como un useState normal (sin persistir).
export function usePersistentState(key, initial, validate) {
  const [state, setState] = useState(() => (key ? load(key, validate, initial) : initial))
  useEffect(() => {
    if (!key) return
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(state))
    } catch {
      // Cuota llena o storage deshabilitado: seguimos en memoria, sin romper.
    }
  }, [key, state])
  return [state, setState]
}

// --- Validadores reutilizables (ante la duda, se descarta lo guardado y se usa el inicial) ---
export const isOneOf = (allowed) => (v) => allowed.includes(v)

export const isTrackArray = (v) =>
  Array.isArray(v) &&
  v.every((t) => t && typeof t === 'object' && typeof t.track_id === 'number')

export const isNumberArrayOrNull = (v) =>
  v === null || (Array.isArray(v) && v.every((n) => typeof n === 'number'))

export const isPoolOrNull = (v) =>
  v === null ||
  (v &&
    typeof v === 'object' &&
    Array.isArray(v.ids) &&
    v.ids.every((n) => typeof n === 'number') &&
    Array.isArray(v.names))

export const isFilters = (v) =>
  v &&
  typeof v === 'object' &&
  typeof v.quality === 'string' &&
  typeof v.onlyRepresentatives === 'boolean'

export const isSort = (v) =>
  v &&
  typeof v === 'object' &&
  (v.key === null || typeof v.key === 'string') &&
  (v.dir === 'asc' || v.dir === 'desc')
