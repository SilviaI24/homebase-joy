/**
 * Supabase Edge Function: /functions/v1/valorador
 *
 * Recibe los datos del formulario valorador de la web y los guarda en Supabase:
 *   - Propiedad  → tabla `properties`  (estatus = "Prospección", sin verificar)
 *   - Propietario → tabla `contacts`   (ciclo_vida = "Prospecto", canal_origen = "SilvIA-Valorador")
 *   - Vinculación → tabla `contact_roles` (tipo = "Propietario")
 *
 * Acepta nombres de campo en formato Airtable (español) o snake_case normalizado.
 *
 * Endpoint público sin autenticación (verify_jwt=false) — protegido solo por
 * un límite de envíos por IP (tabla valorador_submissions). No sustituye a un
 * CAPTCHA; si el volumen de spam justifica más, añadir Turnstile/hCaptcha en
 * el formulario del lado del cliente (hallazgo C-05 de la auditoría del 14 ago).
 *
 * CORS: "Access-Control-Allow-Origin: *" — pendiente de restringir al dominio
 * real de la web una vez confirmado (hoy cualquier origen puede invocarla).
 *
 * Deploy:
 *   supabase functions deploy valorador --project-ref fyrfkbcabmitbfuqeccq
 *
 * URL pública:
 *   POST https://fyrfkbcabmitbfuqeccq.supabase.co/functions/v1/valorador
 *
 * Headers requeridos:
 *   Content-Type: application/json
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT_MAX_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

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

function clientIp(req: Request): string {
  // Supabase Edge Runtime reenvía la IP real en x-forwarded-for (primer valor).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
}

async function checkRateLimit(supa: SupabaseClient, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supa
    .from("valorador_submissions")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  // Si falla la comprobación (p. ej. tabla no disponible), no bloqueamos envíos
  // legítimos por un problema nuestro — solo lo registramos.
  if (error) {
    console.error("[valorador] rate-limit check falló:", error.message);
    return true;
  }
  return (count ?? 0) < RATE_LIMIT_MAX_PER_HOUR;
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

  const ip = clientIp(req);
  await supa.from("valorador_submissions").insert({ ip }); // se registra intente o no, para el límite
  if (!(await checkRateLimit(supa, ip))) {
    return json({ ok: false, error: "Demasiadas solicitudes. Inténtalo más tarde." }, 429);
  }

  let propertyId: string | null = null;
  let contactId: string | null = null;

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
      trastero:            pick(body["Trastero"],            body.trastero)                                || "",
      terraza:             pick(body["Terraza"],             body.terraza)                                || "",
      balcon:              pick(body["Balcon"]               ?? body["Balcón"]   ?? body.balcon)          || "",
      armarios_empotrados: pick(body["Armarios empotrados"], body.armarios_empotrados)                    || "",
      estado:              pick(body["Estado"],              body.estado)                                 || "",
      ano_construccion:    pick(body["Año de construcción"]  ?? body["Año de construccion"] ?? body.ano_construccion) || "",
      precio:              num(body["Precio"]                ?? body.precio),
      orientacion:         orientacion                                                                    || "",
      descripcion:         pick(body["Descripción"]          ?? body["Descripcion"] ?? body.descripcion)  || "",
      // Fijos para el valorador: entra como prospecto sin verificar, nunca
      // como listado activo (antes se guardaba como "Activo" por error — un
      // envío del formulario público no debe aparecer como inmueble en venta).
      estatus:             "Prospección",
      publicacion:         "PROSPECTO",
      es_alquiler:         false,
    };

    // ── 2. Insertar propiedad ────────────────────────────────────────────────
    const { data: propRow, error: propErr } = await supa
      .from("properties")
      .insert(property)
      .select("id")
      .single();

    if (propErr) throw new Error(`properties: ${propErr.message}`);
    propertyId = propRow.id;

    // ── 3. Mapear y crear contacto (propietario) ────────────────────────────
    const nombre   = pick(body["nombre"],   body["Nombre"],   body["Nombre Propietario"]);
    const telefono = pick(body["telefono"], body["Teléfono"], body["Telefono"]);
    const email    = pick(body["email"],    body["Email"]);
    const motivo   = pick(body["motivo"],   body["Observaciones"], body.observaciones, "Valoración de inmueble");

    if (nombre || telefono || email) {
      const { data: contactRow, error: contactErr } = await supa
        .from("contacts")
        .insert({
          nombre:       nombre   || "Sin nombre",
          telefono:     telefono || "",
          email:        email    || "",
          motivo:       motivo,
          ciclo_vida:   "Prospecto",
          // Valor válido del CHECK contacts_canal_origen_check — la versión
          // anterior usaba "Valorador-Web", que no existe en el constraint y
          // hacía fallar el alta del contacto (el inmueble quedaba huérfano).
          canal_origen: "SilvIA-Valorador",
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

    // Compensación manual: sin transacción entre las tres tablas, si un paso
    // posterior falla deshacemos lo ya insertado en vez de dejar un inmueble
    // o contacto huérfano (hallazgo C-05 — "un fallo intermedio no debe dejar
    // inmueble o contacto huérfano").
    if (contactId) await supa.from("contacts").delete().eq("id", contactId);
    if (propertyId) await supa.from("properties").delete().eq("id", propertyId);

    // No devolver el mensaje interno de Postgres al cliente público.
    return json({ ok: false, error: "No se pudo procesar la solicitud. Inténtalo de nuevo." }, 500);
  }
});
