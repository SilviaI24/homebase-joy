/**
 * Supabase Edge Function: /functions/v1/valorador
 *
 * Recibe los datos del formulario valorador de la web y los guarda en Supabase:
 *   - Propiedad  → tabla `properties`  (estatus = "Prospección")
 *   - Propietario → tabla `contacts`   (ciclo_vida = "Prospecto", canal_origen = "Valorador")
 *   - Vinculación → tabla `contact_roles` (tipo = "Propietario")
 *
 * Acepta nombres de campo en formato Airtable (español) o snake_case normalizado.
 *
 * Deploy:
 *   supabase functions deploy valorador --project-ref fyrfkbcabmitbfuqeccq
 *
 * URL pública:
 *   POST https://fyrfkbcabmitbfuqeccq.supabase.co/functions/v1/valorador
 *
 * Headers requeridos:
 *   Content-Type: application/json
 *   Authorization: Bearer <SUPABASE_ANON_KEY>   (o sin auth si se configura --no-verify-jwt)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function str(v: unknown): string {
  return v != null && v !== "" ? String(v).trim() : "";
}

function pick(...keys: unknown[]): string {
  for (const k of keys) if (k != null && k !== "") return String(k).trim();
  return "";
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  // ── Supabase client (service role — nunca exponer en el frontend) ──────────
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // ── 1. Mapear datos del inmueble ────────────────────────────────────────
    //  Acepta tanto nombres Airtable ("Calle", "Tipo de inmueble (desplegable)")
    //  como nombres normalizados ("calle", "tipo")
    const orientacionRaw = body["Orientación"] ?? body["Orientacion"] ?? body.orientacion;
    const orientacion = Array.isArray(orientacionRaw)
      ? orientacionRaw.join(", ")
      : str(orientacionRaw);

    const property = {
      calle:               pick(body["Calle"],               body.calle),
      numero:              pick(body["Numero"],              body["Número"],    body.numero)              || "",
      barrio:              pick(body["Barrio"],              body.barrio)                                 || "",
      localidad:           pick(body["Localidad"],           body.localidad)                              || "",
      tipo:                pick(body["Tipo de inmueble (desplegable)"], body["Tipo de inmueble"], body.tipo) || "Piso",
      metros_construidos:  num(body["Superficie"]            ?? body.superficie),
      habitaciones:        num(body["Habitaciones / dormitorios"] ?? body["Habitaciones"] ?? body.habitaciones),
      banos:               num(body["Baño"]                  ?? body["Banos"]    ?? body.banos),
      piso:                pick(body["Planta"],              body.piso,         body.planta)              || "",
      garaje:              pick(body["Garaje"],              body.garaje)                                 || "",
      ascensor:            pick(body["Ascensor"],            body.ascensor)                               || "",
      trastero:            pick(body["Trastero"],            body.trastero)                               || "",
      terraza:             pick(body["Terraza"],             body.terraza)                                || "",
      balcon:              pick(body["Balcon"]               ?? body["Balcón"]   ?? body.balcon)          || "",
      armarios_empotrados: pick(body["Armarios empotrados"], body.armarios_empotrados)                    || "",
      estado:              pick(body["Estado"],              body.estado)                                 || "",
      ano_construccion:    pick(body["Año de construcción"]  ?? body["Año de construccion"] ?? body.ano_construccion) || "",
      precio:              num(body["Precio"]                ?? body.precio),
      orientacion:         orientacion                                                                    || "",
      descripcion:         pick(body["Descripción"]          ?? body["Descripcion"] ?? body.descripcion)  || "",
      // Fijos para el valorador
      estatus:             "Activo",
      publicacion:         "SUBIR",
      es_alquiler:         false,
    };

    // ── 2. Insertar propiedad ────────────────────────────────────────────────
    const { data: propRow, error: propErr } = await supa
      .from("properties")
      .insert(property)
      .select("id")
      .single();

    if (propErr) throw new Error(`properties: ${propErr.message}`);
    const propertyId: string = propRow.id;

    // ── 3. Mapear y crear contacto (propietario) ────────────────────────────
    const nombre   = pick(body["nombre"],   body["Nombre"],   body["Nombre Propietario"]);
    const telefono = pick(body["telefono"], body["Teléfono"], body["Telefono"]);
    const email    = pick(body["email"],    body["Email"]);
    const motivo   = pick(body["motivo"],   body["Observaciones"], body.observaciones, "Valoración de inmueble");

    let contactId: string | null = null;

    if (nombre || telefono || email) {
      const { data: contactRow, error: contactErr } = await supa
        .from("contacts")
        .insert({
          nombre:       nombre   || "Sin nombre",
          telefono:     telefono || "",
          email:        email    || "",
          motivo:       motivo,
          ciclo_vida:   "Prospecto",
        })
        .select("id")
        .single();

      if (contactErr) throw new Error(`contacts: ${contactErr.message}`);
      contactId = contactRow.id;

      // ── 4. Vincular como Propietario ──────────────────────────────────────
      const { error: roleErr } = await supa.from("contact_roles").insert({
        contact_id:  contactId,
        property_id: propertyId,
        tipo:        "Propietario",
      });
      if (roleErr) throw new Error(`contact_roles: ${roleErr.message}`);
    }

    return json({ ok: true, property_id: propertyId, contact_id: contactId }, 201);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[valorador]", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
