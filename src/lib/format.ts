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
