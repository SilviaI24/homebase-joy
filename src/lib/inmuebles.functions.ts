import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";

export type Inmueble = {
  id: string;
  ref: string;
  calle: string;
  numero: string;
  localidad: string;
  barrio: string;
  precio: number | null;
  precioFinal: number | null;
  tipo: string;
  estatus: string;
  publicacion: string;
  estado: string;
  habitaciones: string;
  banos: string;
  superficie: string;
  imagen: string | null;
  descripcion: string;
  propietario: string;
  telefonoPropietario: string;
};

function pickAttachment(field: unknown): string | null {
  if (Array.isArray(field) && field.length > 0) {
    const att = field[0] as { url?: string; thumbnails?: { large?: { url?: string } } };
    return att.thumbnails?.large?.url ?? att.url ?? null;
  }
  return null;
}

function pickLookup(field: unknown): string {
  if (Array.isArray(field)) return field.filter(Boolean).join(", ");
  return field == null ? "" : String(field);
}

export const listInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  // Pull a generous page; pagination later if needed.
  const params = new URLSearchParams({ pageSize: "100" });
  const data = (await airtableFetch(
    `/v0/${BASE_ID}/${TABLES.inmuebles}?${params}`,
  )) as { records: Array<{ id: string; fields: Record<string, unknown> }> };

  const inmuebles: Inmueble[] = data.records.map((r) => {
    const f = r.fields;
    return {
      id: r.id,
      ref: String(f["Ref"] ?? ""),
      calle: String(f["Calle"] ?? "").trim(),
      numero: String(f["Numero"] ?? ""),
      localidad: String(f["Localidad"] ?? ""),
      barrio: String(f["Barrio"] ?? ""),
      precio: typeof f["Precio"] === "number" ? (f["Precio"] as number) : null,
      precioFinal:
        typeof f["Precio Final "] === "number" ? (f["Precio Final "] as number) : null,
      tipo: String(f["Tipo de inmueble (desplegable)"] ?? ""),
      estatus: String(f["Estatus"] ?? ""),
      publicacion: String(f["Publicación"] ?? ""),
      estado: String(f["Estado"] ?? ""),
      habitaciones: String(f["Habitaciones / dormitorios"] ?? ""),
      banos: String(f["Baño"] ?? ""),
      superficie: String(f["Superficie"] ?? ""),
      imagen: pickAttachment(f["Imágenes"]),
      descripcion: String(f["Descripción"] ?? ""),
      propietario: pickLookup(f["Nombre Propietario"]),
      telefonoPropietario: pickLookup(f["Teléfono Propietario"]),
    };
  });

  return { inmuebles };
});
