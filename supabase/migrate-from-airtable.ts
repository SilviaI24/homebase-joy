/**
 * Airtable → Supabase migration script
 * Run with: npx tsx supabase/migrate-from-airtable.ts
 *
 * Set env vars before running:
 *   AIRTABLE_API_KEY=...
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJ...
 */

import { createClient } from "@supabase/supabase-js";

const AIRTABLE_BASE = "appJHlqz7fFFjJWF1";
const AIRTABLE_KEY  = process.env.AIRTABLE_API_KEY ?? "";
const SUPA_URL      = process.env.SUPABASE_URL ?? "";
const SUPA_KEY      = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!AIRTABLE_KEY || !SUPA_URL || !SUPA_KEY) {
  console.error("Missing env vars: AIRTABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false },
});

// ── Airtable fetch helpers ────────────────────────────────────────────────────

async function fetchAll(table: string, fields?: string[]): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  const params = new URLSearchParams({ pageSize: "100" });
  if (fields?.length) fields.forEach((f) => params.append("fields[]", f));

  do {
    if (offset) params.set("offset", offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable error on ${table}: ${err}`);
    }
    const json = (await res.json()) as { records: any[]; offset?: string };
    records.push(...json.records);
    offset = json.offset;
    if (offset) await sleep(250); // respect rate limits
  } while (offset);

  return records;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v).trim();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function arr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [String(v)];
}

function mapCanalOrigen(tipo: string, conv: string): string | null {
  const t = tipo.toLowerCase();
  const c = conv.toLowerCase();
  if (c.includes("whatsapp")) return "SilvIA-WhatsApp";
  if (c.includes("voz") || c.includes("llamada") || c.includes("voice")) return "SilvIA-Voz";
  if (c.includes("email") || c.includes("mail")) return "SilvIA-Email";
  if (t.includes("valorador") || t.includes("valorac")) return "SilvIA-Valorador";
  if (t.includes("idealista")) return "Idealista";
  if (t.includes("presencial") || t.includes("oficina")) return "Presencial";
  if (t.includes("referido") || t.includes("boca")) return "Referido";
  return "Manual";
}

function mapCicloVida(tipo: string, propIds: string[], compradorIds: string[], alquilerIds: string[]): string {
  const t = tipo.toLowerCase();
  if (t.includes("anular")) return "Descartado";
  const isCliente = propIds.length > 0 || compradorIds.length > 0 || alquilerIds.length > 0
    || t === "propietario" || t === "comprador";
  if (isCliente) return "Activo";
  if (t.includes("prospecc")) return "Prospecto";
  return "Lead";
}

function mapRolTipo(tipo: string, propIds: string[], compradorIds: string[], alquilerIds: string[]): string[] {
  const roles: string[] = [];
  const t = tipo.toLowerCase();
  if (t === "propietario" || propIds.length > 0) roles.push("Propietario");
  if (t === "comprador" || compradorIds.length > 0) roles.push("Comprador");
  if (alquilerIds.length > 0) roles.push("Inquilino");
  return roles;
}

// ── Main migration ────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀  Starting Airtable → Supabase migration\n");

  // ── 1. Agents ─────────────────────────────────────────────
  console.log("1/5  Migrating agents...");
  const airtableAgents = await fetchAll("Agentes");
  const agentIdMap = new Map<string, string>(); // airtable_id → supabase uuid

  for (const r of airtableAgents) {
    const f = r.fields;
    const { data, error } = await supabase
      .from("agents")
      .upsert({
        nombre:      str(f["Nombre"] ?? f["Name"] ?? "Sin nombre"),
        email:       str(f["Email"] ?? f["Mail"] ?? f["Correo"]),
        telefono:    str(f["Teléfono"] ?? f["Telefono"]),
        activo:      f["Activo"] !== false,
        airtable_id: r.id,
      }, { onConflict: "airtable_id" })
      .select("id")
      .single();

    if (error) { console.warn("  Agent error:", error.message, f); continue; }
    agentIdMap.set(r.id, data.id);
  }
  console.log(`   ✓ ${agentIdMap.size} agents\n`);

  // ── 2. Properties ─────────────────────────────────────────
  console.log("2/5  Migrating properties...");
  const airtableProps = await fetchAll("Inmuebles");
  const propIdMap = new Map<string, string>(); // airtable_id → supabase uuid
  let propCount = 0;

  for (const r of airtableProps) {
    const f = r.fields;
    const esAlquiler =
      str(f["Categoria"] ?? f["Categoría"] ?? "").toLowerCase().includes("alquiler");

    const imagenes = arr(f["Fotos"] ?? f["Imagenes"] ?? f["Imágenes"]).map((url, i) => ({
      url,
      filename: `foto_${i + 1}`,
      orden: i,
    }));

    const agentAirtableId = arr(f["Agente"] ?? f["Comercial"])[0];
    const agente_id = agentAirtableId ? (agentIdMap.get(agentAirtableId) ?? null) : null;

    const { data, error } = await supabase
      .from("properties")
      .upsert({
        ref:                str(f["Ref"] ?? f["Referencia"]),
        tipo:               str(f["Tipo"] ?? f["Tipo de inmueble"]),
        categoria:          str(f["Categoria"] ?? f["Categoría"]),
        es_alquiler:        esAlquiler,
        calle:              str(f["Calle"] ?? f["Dirección"] ?? f["Direccion"]),
        numero:             str(f["Número"] ?? f["Numero"]),
        piso:               str(f["Piso"]),
        puerta:             str(f["Puerta"]),
        barrio:             str(f["Barrio"] ?? f["Zona"]),
        localidad:          str(f["Localidad"] ?? f["Municipio"]),
        provincia:          str(f["Provincia"]),
        cp:                 str(f["CP"] ?? f["Código postal"]),
        metros_construidos: num(f["m² construidos"] ?? f["Metros construidos"]),
        metros_utiles:      num(f["m² útiles"] ?? f["Metros utiles"]),
        habitaciones:       num(f["Habitaciones"]),
        banos:              num(f["Baños"] ?? f["Banos"]),
        orientacion:        str(f["Orientación"] ?? f["Orientacion"]),
        descripcion:        str(f["Descripción"] ?? f["Descripcion"]),
        precio:             num(f["Precio"]),
        precio_final:       num(f["Precio final"] ?? f["Precio Final"]),
        estatus:            str(f["Estatus"] ?? f["Estado"] ?? "Activo"),
        imagenes:           imagenes,
        agente_id:          agente_id,
        airtable_id:        r.id,
      }, { onConflict: "airtable_id" })
      .select("id")
      .single();

    if (error) { console.warn("  Property error:", error.message); continue; }
    propIdMap.set(r.id, data.id);
    propCount++;
  }
  console.log(`   ✓ ${propCount} properties\n`);

  // ── 3. Contacts ───────────────────────────────────────────
  console.log("3/5  Migrating contacts...");
  const airtableContacts = await fetchAll("Contactos");
  const contactIdMap = new Map<string, string>(); // airtable_id → supabase uuid
  let contactCount = 0;
  const rolesQueue: Array<{
    contact_id: string;
    tipo: string;
    property_id: string | null;
    agente_id: string | null;
  }> = [];

  for (const r of airtableContacts) {
    const f = r.fields;

    const tipo         = str(f["Tipo de cliente"] ?? f["Tipo"]);
    const propIds      = arr(f["Propiedad"] ?? f["Propiedades"] ?? f["propiedadIds"]);
    const comprIds     = arr(f["Inmueble comprador"] ?? f["inmuebleCompradorIds"]);
    const alqIds       = arr(f["Propiedad alquiler"] ?? f["propiedadAlquilerIds"]);

    const ciclo_vida   = mapCicloVida(tipo, propIds, comprIds, alqIds);
    const canal_origen = mapCanalOrigen(tipo, str(f["Canal"] ?? f["Conversaciones"] ?? ""));

    const attachments = arr(f["Documentos"] ?? f["Adjuntos"] ?? []).map((url) => ({
      url,
      filename: url.split("/").pop() ?? "documento",
      type:     "application/octet-stream",
    }));

    const { data, error } = await supabase
      .from("contacts")
      .upsert({
        nombre:          str(f["Nombre"] ?? f["Name"] ?? "Sin nombre"),
        telefono:        str(f["Teléfono"] ?? f["Telefono"]),
        email:           str(f["Email"] ?? f["Correo"]),
        dni:             str(f["DNI"] ?? f["NIF"]),
        profesion:       str(f["Profesión"] ?? f["Profesion"]),
        ciclo_vida,
        canal_origen,
        motivo:          str(f["Motivo"] ?? f["Motivo consulta"]),
        solicitud:       str(f["Solicitud"]),
        conversaciones:  str(f["Conversaciones"]),
        observaciones:   str(f["Observaciones"]),
        feedback:        str(f["Feedback"]),
        seccion:         str(f["Sección"] ?? f["Seccion"]),
        trabajado:       str(f["Trabajado"]),
        presupuesto_min: num(f["Presupuesto mínimo"] ?? f["Presupuesto min"]),
        presupuesto_max: num(f["Presupuesto máximo"] ?? f["Presupuesto"] ?? f["Presupuesto max"]),
        habitaciones_min: num(f["Habitaciones"]),
        zonas:           arr(f["Zonas"] ?? f["Zona"]),
        categoria:       arr(f["Categoría interés"] ?? f["Categoria"]),
        contrato_trabajo: str(f["Contrato trabajo"]),
        mascota:         str(f["Mascota"]),
        avalista:        str(f["Avalista"]),
        duplicados:      num(f["Duplicados"]) ?? 1,
        attachments,
        airtable_id:     r.id,
        created_at:      f["Fecha"] ? new Date(f["Fecha"]).toISOString() : undefined,
      }, { onConflict: "airtable_id" })
      .select("id")
      .single();

    if (error) { console.warn("  Contact error:", error.message); continue; }
    const contactSupaId = data.id;
    contactIdMap.set(r.id, contactSupaId);
    contactCount++;

    // Agentes asignados
    const agentAirtableIds = arr(f["Agentes"] ?? f["Agente"] ?? f["Comerciales"]);
    for (const aid of agentAirtableIds) {
      const agentSupaId = agentIdMap.get(aid);
      if (agentSupaId) {
        await supabase.from("contact_agents").upsert(
          { contact_id: contactSupaId, agent_id: agentSupaId },
          { onConflict: "contact_id,agent_id" }
        );
      }
    }

    // Queue roles
    const roles = mapRolTipo(tipo, propIds, comprIds, alqIds);
    const agentSupaId = agentAirtableIds[0] ? agentIdMap.get(agentAirtableIds[0]) ?? null : null;

    if (roles.includes("Propietario")) {
      const propSupaId = propIds[0] ? propIdMap.get(propIds[0]) ?? null : null;
      rolesQueue.push({ contact_id: contactSupaId, tipo: "Propietario", property_id: propSupaId, agente_id: agentSupaId });
    }
    if (roles.includes("Comprador")) {
      const propSupaId = comprIds[0] ? propIdMap.get(comprIds[0]) ?? null : null;
      rolesQueue.push({ contact_id: contactSupaId, tipo: "Comprador", property_id: propSupaId, agente_id: agentSupaId });
    }
    if (roles.includes("Inquilino")) {
      const propSupaId = alqIds[0] ? propIdMap.get(alqIds[0]) ?? null : null;
      rolesQueue.push({ contact_id: contactSupaId, tipo: "Inquilino", property_id: propSupaId, agente_id: agentSupaId });
    }
  }
  console.log(`   ✓ ${contactCount} contacts\n`);

  // ── 4. Contact roles ──────────────────────────────────────
  console.log("4/5  Creating contact roles...");
  let roleCount = 0;
  for (const role of rolesQueue) {
    const { error } = await supabase.from("contact_roles").insert({
      contact_id:  role.contact_id,
      tipo:        role.tipo,
      estado:      "Activo",
      agente_id:   role.agente_id,
      property_id: role.property_id,
    });
    if (!error) roleCount++;
  }
  console.log(`   ✓ ${roleCount} roles\n`);

  // ── 5. Visits ─────────────────────────────────────────────
  console.log("5/5  Migrating visits...");
  let visitCount = 0;
  try {
    const airtableVisits = await fetchAll("Visitas");
    for (const r of airtableVisits) {
      const f = r.fields;
      const contactAirtableId = arr(f["Contacto"] ?? f["Cliente"])[0];
      const propAirtableId    = arr(f["Inmueble"] ?? f["Propiedad"])[0];
      const agentAirtableId   = arr(f["Agente"] ?? f["Comercial"])[0];

      const contact_id  = contactAirtableId ? contactIdMap.get(contactAirtableId) ?? null : null;
      const property_id = propAirtableId    ? propIdMap.get(propAirtableId) ?? null    : null;
      const agente_id   = agentAirtableId   ? agentIdMap.get(agentAirtableId) ?? null  : null;

      const fecha = f["Fecha"] ?? f["Fecha visita"];
      if (!fecha) continue;

      const { error } = await supabase.from("visits").upsert({
        contact_id,
        property_id,
        agente_id,
        fecha:       new Date(fecha).toISOString(),
        estado:      str(f["Estado"] ?? "Realizada"),
        notas:       str(f["Notas"] ?? f["Observaciones"]),
        airtable_id: r.id,
      }, { onConflict: "airtable_id" });

      if (!error) visitCount++;
    }
  } catch {
    console.warn("   ⚠ Could not migrate visits (table may have a different name)");
  }
  console.log(`   ✓ ${visitCount} visits\n`);

  // ── Summary ───────────────────────────────────────────────
  console.log("═══════════════════════════════");
  console.log("Migration complete:");
  console.log(`  Agents:     ${agentIdMap.size}`);
  console.log(`  Properties: ${propCount}`);
  console.log(`  Contacts:   ${contactCount}`);
  console.log(`  Roles:      ${roleCount}`);
  console.log(`  Visits:     ${visitCount}`);
  console.log("═══════════════════════════════\n");
  console.log("Next step: update the app data layer (src/lib/) to use Supabase.");
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
