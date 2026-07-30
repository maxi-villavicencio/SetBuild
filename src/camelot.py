"""Rueda de Camelot: mapeo de tonalidad musical -> codigo Camelot y compatibilidad.

Regla de mezcla armonica desde un codigo XA/XB:
  - mismo codigo            (mezcla perfecta)
  - +1 con la misma letra   (adyacente en la rueda, sube energia)
  - -1 con la misma letra   (adyacente, baja energia)
  - mismo numero, otra letra (relativo mayor/menor, cambio de mood)
Ej: desde 2A -> {2A, 3A, 1A, 2B}, tal como lo pediste.
"""
import re

# Pitch class de la fundamental (0=C ... 11=B), con enarmonicos
_PITCH = {
    "C": 0, "B#": 0,
    "C#": 1, "DB": 1,
    "D": 2,
    "D#": 3, "EB": 3,
    "E": 4, "FB": 4,
    "F": 5, "E#": 5,
    "F#": 6, "GB": 6,
    "G": 7,
    "G#": 8, "AB": 8,
    "A": 9,
    "A#": 10, "BB": 10,
    "B": 11, "CB": 11,
}

# Camelot por pitch class de la fundamental
_MINOR_BY_PC = {9: "8A", 10: "3A", 11: "10A", 0: "5A", 1: "12A", 2: "7A",
                3: "2A", 4: "9A", 5: "4A", 6: "11A", 7: "6A", 8: "1A"}
_MAJOR_BY_PC = {0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
                6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B"}

_CAMELOT_RE = re.compile(r"^(\d{1,2})([AB])$")


def key_to_camelot(key):
    """Convierte una tonalidad ('Am', 'F#m', 'C', o ya 'Camelot' como '8A') a codigo Camelot.
    Devuelve None si no la puede interpretar."""
    if not key:
        return None
    k = str(key).strip().upper().replace(" ", "")

    # ya viene en Camelot?
    m = _CAMELOT_RE.match(k)
    if m and 1 <= int(m.group(1)) <= 12:
        return f"{int(m.group(1))}{m.group(2)}"

    # detectar modo
    is_minor = False
    for suffix in ("MIN", "MINOR", "M"):
        if k.endswith(suffix):
            is_minor = True
            k = k[: -len(suffix)]
            break
    else:
        for suffix in ("MAJ", "MAJOR"):
            if k.endswith(suffix):
                k = k[: -len(suffix)]
                break

    pc = _PITCH.get(k)
    if pc is None:
        return None
    return _MINOR_BY_PC[pc] if is_minor else _MAJOR_BY_PC[pc]


def _parse(camelot):
    m = _CAMELOT_RE.match(camelot.strip().upper())
    if not m:
        return None
    return int(m.group(1)), m.group(2)


def compatible_keys(camelot, energy_boost=False):
    """Devuelve el set de codigos Camelot que mezclan bien con `camelot`.
    Con energy_boost=True agrega el salto +7 (subir una quinta) que se usa para levantar el set."""
    parsed = _parse(camelot)
    if not parsed:
        return set()
    num, letter = parsed
    other = "B" if letter == "A" else "A"
    up = num % 12 + 1
    down = (num - 2) % 12 + 1
    result = {f"{num}{letter}", f"{up}{letter}", f"{down}{letter}", f"{num}{other}"}
    if energy_boost:
        boost = (num + 6) % 12 + 1
        result.add(f"{boost}{letter}")
    return result


def is_compatible(a, b, energy_boost=False):
    return b in compatible_keys(a, energy_boost=energy_boost)


def harmonic_relation(a, b, energy_boost=False):
    """Clasifica la relacion armonica de `a` -> `b` en la rueda de Camelot.

    Devuelve una etiqueta ("misma key", "key adyacente (+1)", "key adyacente (-1)",
    "relativo mayor/menor", "salto de energia (+7)") o None si no son compatibles
    (o si alguna key no se pudo interpretar). Reusa la misma matematica de la rueda."""
    pa, pb = _parse(a or ""), _parse(b or "")
    if not pa or not pb:
        return None
    num, letter = pa
    bnum, bletter = pb
    if bnum == num and bletter == letter:
        return "misma key"
    if bletter == letter:
        if bnum == num % 12 + 1:
            return "key adyacente (+1)"
        if bnum == (num - 2) % 12 + 1:
            return "key adyacente (-1)"
    if bnum == num and bletter != letter:
        return "relativo mayor/menor"
    if energy_boost and bletter == letter and bnum == (num + 6) % 12 + 1:
        return "salto de energia (+7)"
    return None
