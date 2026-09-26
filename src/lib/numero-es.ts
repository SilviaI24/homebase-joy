// Parseo de números escritos a mano en formato español (auditoría de altas,
// 26 sep 2026, P4). Superficie/habitaciones/baños llegan como texto libre del
// formulario y antes se convertían con Number(): "1.200" se guardaba como 1,2
// (el punto de miles se leía como decimal), "85 m2" se descartaba en silencio
// y "2.5" habitaciones llegaba a Postgres (columna integer) y fallaba con un
// error ininteligible. Puro, sin dependencias: se usa en servidor y en tests.

// Unidades que la gente escribe detrás de la cifra. Se quitan ANTES de mirar
// los dígitos: "m2" lleva un 2 que, si no, se pegaría al número.
const UNIDADES =
  /\s*(m2|m²|mts2?|mt2|metros(\s+cuadrados)?|€|eur(os)?|hab(itaciones)?\.?|dormitorios?|baños?)\s*$/i;

/**
 * Convierte un texto con formato español en número.
 * - `undefined` si está vacío (el campo no se toca).
 * - `null` si no es un número válido (quien llama decide el mensaje).
 *
 * Reglas: la coma es siempre decimal ("85,5"); el punto es separador de
 * miles cuando va seguido de grupos de exactamente 3 cifras ("1.200",
 * "1.200.000"), y decimal en cualquier otro caso ("2.5"). Con ambos, el que
 * va en último lugar es el decimal ("1.200,50"). No se admiten negativos.
 */
export function parseNumeroEs(v: unknown): number | null | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim();
  if (!s) return undefined;
  s = s.replace(UNIDADES, "").replace(/\s+/g, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    const [entera, frac, ...resto] = s.split(decimal);
    const milesRe = miles === "." ? /^\d{1,3}(\.\d{3})*$/ : /^\d{1,3}(,\d{3})*$/;
    if (resto.length || !milesRe.test(entera) || !/^\d+$/.test(frac ?? "")) return null;
    s = `${entera.split(miles).join("")}.${frac}`;
  } else if (hasComma) {
    if (s.split(",").length > 2) return null;
    s = s.replace(",", ".");
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.split(".").join("");
    else if (s.split(".").length > 2) return null;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Igual que parseNumeroEs, pero lanza un error legible con el nombre del
 * campo si el valor no es válido (o no es entero cuando se exige).
 */
export function numeroEsCampo(
  v: unknown,
  campo: string,
  opts: { entero?: boolean } = {},
): number | undefined {
  const n = parseNumeroEs(v);
  if (n === undefined) return undefined;
  if (n === null) {
    throw new Error(`${campo}: "${String(v)}" no es un número válido`);
  }
  if (opts.entero && !Number.isInteger(n)) {
    throw new Error(`${campo} debe ser un número entero (has escrito "${String(v)}")`);
  }
  return n;
}
