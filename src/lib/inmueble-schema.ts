// Catálogo de campos por tipo de inmueble, puro (sin JSX, sin estado).
// M-03: extraído de src/components/CreateDialogs.tsx (usado solo por
// NewInmuebleDialog).

import type { CreateInmueblePayload } from "@/lib/mutations.functions";

export const TIPOS_VENTA = [
  "Piso",
  "Chalet",
  "Casa",
  "Terreno",
  "Garaje",
  "Trastero",
  "Local",
  "Nave",
  "Oficina",
  "Edificio",
  "Otros",
] as const;
export const TIPOS_ALQUILER = [
  "Alquiler Piso",
  "Alquiler Garaje",
  "Alquiler Oficina",
  "Alquiler Local",
  "Alquiler Trastero",
] as const;
export type TipoInmueble = (typeof TIPOS_VENTA)[number] | (typeof TIPOS_ALQUILER)[number];

export const ALL_TIPOS: TipoInmueble[] = [...TIPOS_VENTA, ...TIPOS_ALQUILER];

export const ICONOS_TIPO: Record<string, string> = {
  Piso: "🏢",
  Chalet: "🏡",
  Casa: "🏠",
  Terreno: "🌳",
  Garaje: "🚗",
  Trastero: "📦",
  Local: "🏪",
  Nave: "🏭",
  Oficina: "💼",
  Edificio: "🏬",
  Otros: "🏷️",
};

export const ORIENTACION_OPCIONES = [
  "Norte",
  "Sur",
  "Este",
  "Oeste",
  "Noreste",
  "Noroeste",
  "Sureste",
  "Suroeste",
] as const;

export type FieldDef = {
  key: keyof CreateInmueblePayload;
  label: string;
  kind?: "input" | "number" | "textarea" | "select" | "date" | "orientacion" | "urls";
  options?: readonly string[];
  required?: boolean;
  full?: boolean;
};

const F = {
  ref: { key: "ref", label: "Ref" } satisfies FieldDef,
  estatus: {
    key: "estatus",
    label: "Estatus",
    kind: "select",
    options: ["Prospección", "Activo", "Reservado", "Vendido", "Alquilado", "Baja"],
  } satisfies FieldDef,
  estado: {
    key: "estado",
    label: "Estado",
    kind: "select",
    options: ["Nuevo", "A reformar", "Reformado", "Buen estado", "Para entrar", "Obra nueva"],
    required: true,
  } satisfies FieldDef,
  precio: { key: "precio", label: "Precio (€)", kind: "number" } satisfies FieldDef,
  localidad: { key: "localidad", label: "Localidad" } satisfies FieldDef,
  barrio: { key: "barrio", label: "Barrio" } satisfies FieldDef,
  calle: { key: "calle", label: "Calle", required: true, full: true } satisfies FieldDef,
  numero: { key: "numero", label: "Número" } satisfies FieldDef,
  superficie: { key: "superficie", label: "Superficie (m²)" } satisfies FieldDef,
  habitaciones: { key: "habitaciones", label: "Habitaciones / dormitorios" } satisfies FieldDef,
  banos: { key: "banos", label: "Baños" } satisfies FieldDef,
  tipoSuelo: { key: "tipoSuelo", label: "Tipo de suelo" } satisfies FieldDef,
  calefaccion: { key: "calefaccion", label: "Calefacción" } satisfies FieldDef,
  orientacion: { key: "orientacion", label: "Orientación", kind: "orientacion" } satisfies FieldDef,
  terraza: { key: "terraza", label: "Terraza" } satisfies FieldDef,
  balcon: { key: "balcon", label: "Balcón" } satisfies FieldDef,
  garaje: {
    key: "garaje",
    label: "Garaje",
    kind: "select",
    options: ["Sí", "No", "Opcional"],
  } satisfies FieldDef,
  trastero: {
    key: "trastero",
    label: "Trastero",
    kind: "select",
    options: ["Sí", "No"],
  } satisfies FieldDef,
  ascensor: {
    key: "ascensor",
    label: "Ascensor",
    kind: "select",
    options: ["Sí", "No"],
  } satisfies FieldDef,
  armariosEmpotrados: {
    key: "armariosEmpotrados",
    label: "Armarios empotrados",
    kind: "select",
    options: ["Sí", "No"],
  } satisfies FieldDef,
  anoConstruccion: { key: "anoConstruccion", label: "Año de construcción" } satisfies FieldDef,
  certificacionEnergetica: {
    key: "certificacionEnergetica",
    label: "Certificación energética",
  } satisfies FieldDef,
  llaves: { key: "llaves", label: "Llaves" } satisfies FieldDef,
  plantas: { key: "plantas", label: "Plantas" } satisfies FieldDef,
  planta: { key: "planta", label: "Planta interior/exterior" } satisfies FieldDef,
  gastosComunidad: { key: "gastosComunidad", label: "Gastos de comunidad" } satisfies FieldDef,
  inquilinos: {
    key: "inquilinos",
    label: "Inquilinos",
    kind: "select",
    options: ["Sí", "No"],
  } satisfies FieldDef,
  publicacion: {
    key: "publicacion",
    label: "Publicación",
    kind: "select",
    options: ["SUBIR", "PUBLICADO"],
  } satisfies FieldDef,
  enlaceTours: {
    key: "enlaceTours",
    label: "Enlace tours",
    kind: "textarea",
    full: true,
  } satisfies FieldDef,
  descripcion: {
    key: "descripcion",
    label: "Descripción",
    kind: "textarea",
    full: true,
  } satisfies FieldDef,
  observaciones: {
    key: "observaciones",
    label: "Observaciones",
    kind: "textarea",
    full: true,
  } satisfies FieldDef,
  tipoChalet: { key: "tipoChalet", label: "Tipo de chalet" } satisfies FieldDef,
  superficieEdificable: {
    key: "superficieEdificable",
    label: "Superficie edificable",
  } satisfies FieldDef,
  viaUrbana: {
    key: "viaUrbana",
    label: "Vía urbana",
    kind: "select",
    options: ["Sí", "No"],
  } satisfies FieldDef,
  salidaHumos: {
    key: "salidaHumos",
    label: "Salida de humos",
    kind: "select",
    options: ["Sí", "No"],
  } satisfies FieldDef,
  almacen: {
    key: "almacen",
    label: "Almacén",
    kind: "select",
    options: ["Sí", "No"],
  } satisfies FieldDef,
  estancias: { key: "estancias", label: "Estancias" } satisfies FieldDef,
  imagenesUrls: {
    key: "imagenesUrls",
    label: "Imágenes (una URL por línea)",
    kind: "urls",
    full: true,
  } satisfies FieldDef,
  documentacionUrls: {
    key: "documentacionUrls",
    label: "Documentación (una URL por línea)",
    kind: "urls",
    full: true,
  } satisfies FieldDef,
} as const;

// Image / documentation URL pseudo-fields are kept out of the schema for now
// (subida real por URL → ver "Mantener por URL" en plan).

export function getSchemaForTipo(t: TipoInmueble): FieldDef[] {
  const base = t.replace(/^Alquiler\s+/, "") as TipoInmueble;
  switch (base) {
    case "Chalet":
    case "Casa":
      return [
        F.ref,
        F.estatus,
        F.precio,
        F.tipoChalet,
        F.localidad,
        F.barrio,
        F.calle,
        F.numero,
        F.plantas,
        F.superficie,
        F.habitaciones,
        F.banos,
        F.tipoSuelo,
        F.calefaccion,
        F.orientacion,
        F.terraza,
        F.garaje,
        F.trastero,
        F.armariosEmpotrados,
        F.estado,
        F.anoConstruccion,
        F.certificacionEnergetica,
        F.llaves,
        F.enlaceTours,
        F.descripcion,
        F.publicacion,
        F.imagenesUrls,
        F.documentacionUrls,
      ];
    case "Terreno":
      return [
        F.ref,
        F.precio,
        F.estatus,
        F.barrio,
        F.localidad,
        F.calle,
        F.numero,
        F.superficie,
        F.superficieEdificable,
        F.viaUrbana,
        F.descripcion,
        F.observaciones,
        F.enlaceTours,
        F.publicacion,
        F.imagenesUrls,
        F.documentacionUrls,
      ];
    case "Piso":
      return [
        F.ref,
        F.estatus,
        F.estado,
        F.precio,
        F.localidad,
        F.barrio,
        F.calle,
        F.numero,
        F.planta,
        F.superficie,
        F.habitaciones,
        F.banos,
        F.orientacion,
        F.calefaccion,
        F.terraza,
        F.ascensor,
        F.garaje,
        F.trastero,
        F.balcon,
        F.armariosEmpotrados,
        F.tipoSuelo,
        F.certificacionEnergetica,
        F.anoConstruccion,
        F.gastosComunidad,
        F.llaves,
        F.inquilinos,
        F.enlaceTours,
        F.observaciones,
        F.publicacion,
        F.imagenesUrls,
        F.documentacionUrls,
      ];
    case "Garaje":
      return [
        F.ref,
        F.estatus,
        F.precio,
        F.localidad,
        F.barrio,
        F.calle,
        F.numero,
        F.superficie,
        F.gastosComunidad,
        F.ascensor,
        F.enlaceTours,
        F.observaciones,
        F.publicacion,
        F.imagenesUrls,
        F.documentacionUrls,
      ];
    case "Local":
    case "Oficina":
    case "Nave":
      return [
        F.ref,
        F.estatus,
        F.estado,
        F.precio,
        F.localidad,
        F.barrio,
        F.calle,
        F.numero,
        F.superficie,
        F.salidaHumos,
        F.almacen,
        F.estancias,
        F.plantas,
        F.ascensor,
        F.garaje,
        F.trastero,
        F.certificacionEnergetica,
        F.anoConstruccion,
        F.tipoSuelo,
        F.habitaciones,
        F.banos,
        F.inquilinos,
        F.observaciones,
        F.enlaceTours,
        F.publicacion,
        F.imagenesUrls,
        F.documentacionUrls,
      ];
    case "Trastero":
      return [
        F.ref,
        F.estatus,
        F.precio,
        F.estado,
        F.calle,
        F.numero,
        F.barrio,
        F.localidad,
        F.superficie,
        F.tipoSuelo,
        F.enlaceTours,
        F.observaciones,
        F.publicacion,
        F.imagenesUrls,
        F.documentacionUrls,
      ];
    default:
      return [
        F.ref,
        F.estatus,
        F.precio,
        F.localidad,
        F.barrio,
        F.calle,
        F.numero,
        F.superficie,
        F.descripcion,
        F.observaciones,
        F.publicacion,
        F.imagenesUrls,
        F.documentacionUrls,
      ];
  }
}
