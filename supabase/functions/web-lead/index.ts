import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();

    const nombre = (body.nombre ?? "").trim();
    const apellidos = (body.apellidos ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const telefono = (body.telefono ?? "").trim();
    const mensaje = (body.mensaje ?? "").trim();
    const property_id = (body.property_id ?? "").trim();

    if (!nombre || !email || !telefono || !property_id) {
      return json({ error: "Campos requeridos: nombre, email, telefono, property_id" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Resolver propiedad → determinar tipo de lead
    const { data: prop, error: propErr } = await supabase
      .from("properties")
      .select("id, es_alquiler")
      .eq("id", property_id)
      .single();

    if (propErr || !prop) return json({ error: "Propiedad no encontrada" }, 404);

    // contact_roles_tipo_check solo admite 'Comprador' | 'Inquilino' | 'Propietario' | 'Arrendador'
    // (antes 'lead_compra'/'lead_alquiler' eran válidos, pero la migración
    // 20260819155547_normalize_legacy_lead_role_types.sql los retiró del CHECK
    // el 19 ago 2026 — esta función no se actualizó entonces y llevaba desde
    // esa fecha dando 500 en todo envío, hasta el fix del 11 sep 2026. Mismo
    // mapeo que usó esa migración para las filas legacy:
    // lead_compra→Comprador, lead_alquiler→Inquilino).
    const rolTipo = prop.es_alquiler ? "Inquilino" : "Comprador";

    // 2. Buscar contacto existente por email o teléfono
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .or(`email.eq.${email},telefono.eq.${telefono}`)
      .limit(1)
      .maybeSingle();

    let contactId: string;

    if (existing) {
      contactId = existing.id;
    } else {
      const nombreCompleto = apellidos ? `${nombre} ${apellidos}` : nombre;
      const { data: created, error: createErr } = await supabase
        .from("contacts")
        .insert({
          nombre: nombreCompleto,
          email,
          telefono,
          ciclo_vida: "Lead",
          canal_origen: "Web",
          observaciones: mensaje,
        })
        .select("id")
        .single();

      if (createErr) throw createErr;
      contactId = created.id;
    }

    // 3. Crear contact_role solo si no existe ya para este par contacto+propiedad
    const { data: existingRole } = await supabase
      .from("contact_roles")
      .select("id")
      .eq("contact_id", contactId)
      .eq("property_id", property_id)
      .maybeSingle();

    if (!existingRole) {
      const { error: roleErr } = await supabase.from("contact_roles").insert({
        contact_id: contactId,
        property_id,
        tipo: rolTipo,
        estado: "Prospecto",
        notas: mensaje,
      });

      if (roleErr) throw roleErr;
    }

    return json({ success: true, contact_id: contactId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("web-lead:", msg);
    return json({ error: "Error interno" }, 500);
  }
});
