/**
 * Sanea un término de búsqueda antes de interpolarlo en un patrón `ilike`
 * dentro de un filtro `.or()` de PostgREST.
 *
 * Dos problemas distintos, corregidos juntos (auditoría, 12 sep 2026):
 * - `,` y `(` `)` son caracteres estructurales del parser de filtros de
 *   PostgREST (separan condiciones / agrupan) — si el término de búsqueda
 *   los trae tal cual, rompen el filtro entero con un 400, no solo el
 *   resultado. No basta con escaparlos con `\`: ese escapado es semántica
 *   de LIKE en SQL, una capa por debajo de donde PostgREST los interpreta
 *   como delimitadores. Se sustituyen por un espacio, igual que ya hacía
 *   `safeSearchTerm` en silvia.functions.ts.
 * - `%` y `_` sí son semántica de LIKE en SQL (comodines) y ahí sí basta con
 *   escaparlos con `\` para que se busquen como caracteres literales.
 *
 * Antes existían dos versiones incompletas de esto (`escapeLike` en
 * inmuebles.functions.ts, `escapeLikeCliente` en clientes-format.ts) que
 * solo cubrían el segundo punto — de ahí que buscar "Mayor, 3" o "López
 * (hijo)" devolviera un error en vez de resultados.
 */
export function escapeSearchTerm(str: string): string {
  return str
    .trim()
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Núcleo compartido de moneyShort — antes triplicado (lógica idéntica salvo
 * el nº de decimales para millones) en dashboard-format.ts, comerciales-format.ts
 * y bandeja-format.ts. Cada uno mantiene su propio moneyShort() como wrapper
 * fino sobre este núcleo, con el mismo decimalsMillion/trato de null que
 * tenía antes, para no cambiar ni un carácter de lo que ve cada pantalla.
 * Unificar el redondeo en sí (¿1 o 2 decimales, mismo criterio en las 3?) es
 * una decisión de producto pendiente, no algo que se decida al eliminar la
 * duplicación de código (ver CLAUDE.md).
 */
export function moneyShortCore(v: number, decimalsMillion: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(decimalsMillion)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}

/**
 * Convierte un texto a formato de título en español:
 * - primera letra de cada palabra en mayúscula
 * - palabras menores (artículos, preposiciones, conjunciones) en minúscula
 *   salvo que sean la primera palabra.
 */
export function cleanRef(ref: string): string {
  const dash = ref.indexOf("-");
  return dash !== -1 ? ref.slice(0, dash) : ref;
}

const LOWER_WORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "al",
  "y",
  "e",
  "o",
  "u",
  "a",
  "en",
  "con",
  "por",
  "para",
  "sin",
  "sobre",
  "entre",
  "hasta",
  "desde",
  "bajo",
  "según",
  "durante",
  "mediante",
  "excepto",
  "salvo",
  "hacia",
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
  return normalized.replace(
    /(^|[.!?]\s+|\n+\s*)(\p{Ll})/gu,
    (_m, sep, ch) => sep + ch.toUpperCase(),
  );
}
