// Helpers de formato puros de Bandeja (M-03: extraídos de
// src/routes/bandeja.index.tsx). Sin estado, sin JSX.

import type { Inmueble } from "@/lib/inmuebles.functions";
import { moneyShortCore } from "@/lib/format";

export function formatFecha(f: string | null): string {
  if (!f) return "Sin fecha";
  try {
    return new Date(f).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return f;
  }
}

// 1 decimal para millones y acepta null -- distinto de dashboard-format.ts (2
// decimales, no acepta null). Ver moneyShortCore en format.ts para el porqué
// de no unificar el redondeo en sí.
export function moneyShort(v: number | null): string {
  if (v == null) return "—";
  return moneyShortCore(v, 1);
}

// ── Detección de inmuebles mencionados en texto libre de conversación ─────────

// Normaliza texto: minúsculas, sin acentos/diacríticos, sin signos.
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[·.,;:()¿?¡!"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Stopwords que no deben usarse como pista de calle por sí solas.
const STOP_TOKENS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "san",
  "santa",
  "santo",
  "y",
  "o",
  "calle",
  "av",
  "avda",
  "avenida",
  "plaza",
  "pza",
  "paseo",
  "po",
  "camino",
  "carretera",
  "ctra",
  "ronda",
  "travesia",
  "via",
  "vía",
  "urbanizacion",
  "urb",
  "barrio",
  "edificio",
  "edif",
  "bloque",
  "esquina",
  "callejon",
  "callejón",
  "glorieta",
  "parque",
]);

// Prefijos de vía a eliminar al inicio de un nombre de calle.
const PREFIX_RE =
  /^(calle|c\/|c\.|avda?\.?|avenida|av\.?|pza\.?|plaza|paseo|po\.?|camino|carretera|ctra\.?|ronda|travesia|travesía|trav\.?|via|vía|urbanizacion|urbanización|urb\.?|glorieta|callejon|callejón|edif\.?|edificio|bloque)\s+/i;

// Equivalencias bidireccionales para que cualquiera de las variantes en el
// texto del cliente se acepte como mención válida.
const ALIAS_GROUPS: string[][] = [
  ["avenida", "avda", "av"],
  ["calle", "c"],
  ["plaza", "pza"],
  ["paseo", "po"],
  ["carretera", "ctra"],
  ["travesia", "trav"],
  ["urbanizacion", "urb"],
  ["edificio", "edif"],
  ["sant", "san", "santa", "sta", "sto"],
];

function expandAlias(token: string): string[] {
  for (const group of ALIAS_GROUPS) {
    if (group.includes(token)) return group;
  }
  return [token];
}

// Devuelve los tokens "significativos" de un nombre de vía: sin prefijo,
// sin stopwords y con longitud mínima.
function streetTokens(calle: string): string[] {
  const cleaned = normalize(calle).replace(PREFIX_RE, "").trim();
  if (!cleaned) return [];
  return cleaned.split(" ").filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

// Construye un patrón regex con límites de palabra y aliasing.
function tokenPattern(token: string): string {
  const variants = expandAlias(token).map(escapeReg);
  return `(?:${variants.join("|")})`;
}

// Términos geográficos demasiado genéricos para considerarse mención de un
// inmueble concreto (aparecen en casi cualquier conversación).
const GENERIC_LOCATIONS = new Set([
  "centro",
  "gijon",
  "oviedo",
  "asturias",
  "españa",
  "espana",
  "norte",
  "sur",
  "este",
  "oeste",
]);

export function comercialStatus(inm: Inmueble): string {
  return normalize(inm.estatus || inm.estado);
}

// Detecta inmuebles mencionados en el texto libre de la conversación.
// Reglas de alta precisión (preferimos no mostrar a mostrar falsos positivos):
//   1. Referencia exacta del inmueble (#1234) — máxima confianza.
//   2. Frase completa del nombre de calle (sin prefijo) con tokens consecutivos.
// Se descartan los matches por barrio / localidad o por una sola palabra
// suelta porque generaban falsos positivos masivos (p.ej. "centro", "gijón").
export type InmuebleWithPatterns = Inmueble & { _refRe: RegExp | null; _streetRe: RegExp | null };

// Pre-compila los regex de ref/calle de cada inmueble comerciable — se llama
// una vez por lista (memoizada en el caller), no por conversación.
const WORD_BOUNDARY_START = "(?:^|[^a-z0-9ñ])";
const WORD_BOUNDARY_END = "(?:[^a-z0-9ñ]|$)";

export function compileInmueblePatterns(inm: Inmueble): InmuebleWithPatterns {
  const _refRe =
    inm.ref && inm.ref.length >= 4
      ? new RegExp(`${WORD_BOUNDARY_START}#?${escapeReg(normalize(inm.ref))}${WORD_BOUNDARY_END}`)
      : null;
  const _tokens = streetTokens(inm.calle).filter((t) => !GENERIC_LOCATIONS.has(t));
  const _streetRe =
    _tokens.length >= 2
      ? new RegExp(
          `${WORD_BOUNDARY_START}${_tokens.map(tokenPattern).join("\\s+")}${WORD_BOUNDARY_END}`,
        )
      : null;
  return { ...inm, _refRe, _streetRe };
}

export function findMentionedInmuebles(
  text: string,
  inmuebles: InmuebleWithPatterns[],
): Inmueble[] {
  const haystack = ` ${normalize(text)} `;
  if (!haystack.trim()) return [];
  const found = new Map<string, Inmueble>();
  for (const inm of inmuebles) {
    if (found.has(inm.id)) continue;
    if (inm._refRe?.test(haystack)) {
      found.set(inm.id, inm);
      continue;
    }
    if (inm._streetRe?.test(haystack)) {
      found.set(inm.id, inm);
    }
  }
  return Array.from(found.values()).slice(0, 6);
}
