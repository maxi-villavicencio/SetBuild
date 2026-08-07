import { useState } from 'react'

// Lógica de ordenamiento compartida entre la vista plana (TracksTable) y las carpetas de
// género (GroupedView), para que se comporte idéntico y no se desincronice.

// Comparador de tracks: nulos al final en ambas direcciones; numérico o texto (localeCompare 'es').
export function compareTracks(a, b, key, num, dir) {
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  let r
  if (num) r = va - vb
  else r = String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' })
  return dir === 'asc' ? r : -r
}

// Devuelve una copia ordenada de `rows` según `sort` ({key, dir}); usa `columns` para saber si
// la columna es numérica.
export function sortTracks(rows, sort, columns) {
  const col = columns.find((c) => c.key === sort.key)
  return [...rows].sort((a, b) => compareTracks(a, b, sort.key, col?.num, sort.dir))
}

// Estado de orden con toggle asc/desc. Una columna nueva arranca en 'asc'; volver a clickearla
// alterna la dirección.
export function useTableSort(defaultSort) {
  const [sort, setSort] = useState(defaultSort)
  const onSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )
  return { sort, onSort }
}
