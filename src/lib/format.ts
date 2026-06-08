/**
 * Convierte un texto a formato de título en español:
 * - primera letra de cada palabra en mayúscula
 * - palabras menores (artículos, preposiciones, conjunciones) en minúscula
 *   salvo que sean la primera palabra.
 */
const LOWER_WORDS = new Set([
  "de", "del", "la", "las", "el", "los", "al", "y", "e", "o", "u", "a", "en",
  "con", "por", "para", "sin", "sobre", "entre", "hasta", "desde", "bajo",
  "según", "durante", "mediante", "excepto", "salvo", "hacia",
]);

export function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i === 0 || !LOWER_WORDS.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
}

export function toTitleCaseArr(arr: string[]): string[] {
  return arr.map(toTitleCase);
}

/**
 * Convierte texto largo a sentence case: mayúscula al inicio de cada frase,
 * el resto en minúscula. Preserva siglas (palabras completamente en
 * mayúsculas de 2-5 letras) y números/fechas.
 */
export function toSentenceCase(str: string): string {
  if (!str) return str;
  // Si el texto ya parece estar en sentence case razonable (pocas mayúsculas
  // intermedias), lo dejamos tal cual.
  const tokens = str.split(/(\s+)/);
  const normalized = tokens
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      // Preserva siglas cortas
      if (/^[A-ZÁÉÍÓÚÑ]{2,5}$/.test(tok)) return tok;
      // Preserva tokens con dígitos (fechas, horas, refs)
      if (/\d/.test(tok)) return tok;
      return tok.toLowerCase();
    })
    .join("");
  // Capitaliza inicio de cada frase (después de . ! ? o salto de línea).
  return normalized.replace(/(^|[.!?]\s+|\n+\s*)(\p{Ll})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

