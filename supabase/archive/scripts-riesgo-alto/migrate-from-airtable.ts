// ⚠️  NO EJECUTAR — archivado el 19 ago 2026 (hallazgo H-09, auditoría Codex 14 ago 2026).
// Script de importación/reparación de una sola vez de la era Airtable, ya migrada.
// Corre con service_role, sin modo dry-run obligatorio, sin transacción/backup,
// y puede apuntar al proyecto ESGI real por variables de entorno. Si algún día hace
// falta reutilizar su lógica: exigir confirmación explícita, dry-run, snapshot previo
// y aprobación de David antes de tocar producción.

/**
 * Airtable → Supabase migration (optimized: parallel fetch + batch inserts)
 * Run: npx tsx supabase/migrate-from-airtable.ts
 * Env: AIRTABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const BASE     = "appJHlqz7fFFjJWF1";
const AT_KEY   = process.env.AIRTABLE_API_KEY ?? "";
const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!AT_KEY || !SUPA_URL || !SUPA_KEY) {
  console.error("Missing: AIRTABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const CHUNK = 500;

// ── helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const str = (v: unknown): string => {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join(", ");
  return String(v).trim();
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
};

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : [];

const isAlquiler = (tipo: string) => /^\s*alquiler/i.test(tipo);

type Att = { url?: string; type?: string; filename?: string; thumbnails?: { large?: { url?: string }; full?: { url?: string } } };

const attUrl = (a: Att) => a.thumbnails?.large?.url ?? a.thumbnails?.full?.url ?? a.url ?? "";

const mapAttachments = (field: unknown) =>
  Array.isArray(field)
    ? (field as Att[]).map(a => ({ url: attUrl(a), filename: a.filename ?? "archivo", type: a.type ?? "application/octet-stream" })).filter(a => a.url)
    : [];

const mapImages = (field: unknown) =>
  Array.isArray(field)
    ? (field as Att[]).map((a, i) => ({ url: attUrl(a), filename: a.filename ?? `img_${i}`, orden: i })).filter(a => a.url)
    : [];

const mapCicloVida = (tipo: string, pIds: string[], cIds: string[], aIds: string[]) => {
  const t = tipo.toLowerCase();
  if (t.includes("anular")) return "Descartado";
  if (pIds.length || cIds.length || aIds.length || t === "propietario" || t === "comprador") return "Activo";
  if (t.includes("prospecc")) return "Prospecto";
  return "Lead";
};

// ── Airtable fetch (paginated) ────────────────────────────────────────────────
async function fetchAll(tableId: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${tableId}?${params}`, {
      headers: { Authorization: `Bearer ${AT_KEY}` },
    });
    if (!res.ok) throw new Error(`Airtable ${tableId}: ${await res.text()}`);
    const json = await res.json() as { records: any[]; offset?: string };
    records.push(...json.records);
    offset = json.offset;
    if (offset) await sleep(200);
  } while (offset);
  return records;
}

// ── Batch upsert ──────────────────────────────────────────────────────────────
async function batchUpsert(table: string, rows: any[], conflictCol: string): Promise<number> {
  let ok = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error, data } = await supa.from(table).upsert(chunk, { onConflict: conflictCol }).select("id");
    if (error) console.warn(`  [${table}] batch ${i / CHUNK + 1} error:`, error.message);
    else ok += (data?.length ?? chunk.length);
  }
  return ok;
}

async function batchInsert(table: string, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  let ok = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supa.from(table).insert(chunk);
    if (error) console.warn(`  [${table}] batch ${i / CHUNK + 1} error:`, error.message);
    else ok += chunk.length;
  }
  return ok;
}

// Paginate a full Supabase table select — avoids 1000-row default limit
async function fetchAllSupa<T>(table: string, select: string): Promise<T[]> {
  const results: T[] = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supa.from(table).select(select).range(from, from + page - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    results.push(...(data as T[]));
    if ((data?.length ?? 0) < page) break;
    from += page;
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀  Airtable → Supabase (optimized)\n");

  // ── Step 1: fetch all 4 tables in parallel ────────────────────────────────
  console.log("Fetching all Airtable data in parallel...");
  const t0 = Date.now();
  const [atAgentes, atInmuebles, atClientes, atVisitas] = await Promise.all([
    fetchAll("tbl97g8BL94xdkJp9"),
    fetchAll("tblLEsYvGZqXntJo7"),
    fetchAll("tbl4N1uR3A3XMwsqZ"),
    fetchAll("tblBN7MsFyKLyn1UJ"),
  ]);
  console.log(`   Fetched in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${atAgentes.length} agents, ${atInmuebles.length} properties, ${atClientes.length} contacts, ${atVisitas.length} visits\n`);

  // ── Step 2: Agents ────────────────────────────────────────────────────────
  console.log("1/5  Agents...");
  const agentRows = atAgentes.map(r => ({
    nombre:      str(r.fields["Nombre"]) || "Agente",
    email:       str(r.fields["Mail"]) || null,
    activo:      true,
    airtable_id: r.id,
  }));
  const agentCount = await batchUpsert("agents", agentRows, "airtable_id");

  // build id map (paginated — avoids 1000-row limit)
  const agentsDB = await fetchAllSupa<{ id: string; airtable_id: string }>("agents", "id,airtable_id");
  const agentMap = new Map<string, string>(agentsDB.map(a => [a.airtable_id, a.id]));
  console.log(`   ✓ ${agentCount} agents\n`);

  // ── Step 3: Properties ────────────────────────────────────────────────────
  console.log("2/5  Properties...");
  const seenRefs = new Set<string>();
  const propRows = atInmuebles.map(r => {
    const f    = r.fields;
    const tipo = str(f["Tipo de inmueble (desplegable)"]);
    const rawRef = f["Ref"] ? str(f["Ref"]) : null;
    // deduplicate refs — keep first, append airtable id suffix to dupes
    let ref: string | null = rawRef;
    if (ref) {
      if (seenRefs.has(ref)) ref = `${ref}-${r.id.slice(-4)}`;
      seenRefs.add(ref);
    }
    const agentAT = arr(f["Agentes Asignados"])[0];
    return {
      ref,
      tipo,
      categoria:          isAlquiler(tipo) ? "Alquiler" : "Venta",
      es_alquiler:        isAlquiler(tipo),
      calle:              str(f["Calle"]),
      numero:             str(f["Numero"]),
      piso:               str(f["Planta"]),
      barrio:             str(f["Barrio"]),
      localidad:          str(f["Localidad"]),
      metros_construidos: num(f["Superficie"]),
      habitaciones:       num(f["Habitaciones / dormitorios"]),
      banos:              num(f["Baño"]),
      orientacion:        arr(f["Orientación"]).join(", "),
      descripcion:        str(f["Descripción"]),
      precio:             num(f["Precio"]),
      precio_final:       num(f["Precio Final  "]) || num(f["Precio Final "]) || null,
      estatus:            str(f["Estatus"]) || "Activo",
      imagenes:           mapImages(f["Imágenes"]),
      documentos:         mapAttachments(f["Documentación"]),
      agente_id:          agentAT ? agentMap.get(agentAT) ?? null : null,
      airtable_id:        r.id,
      created_at:         f["Fecha de inicio"] ? new Date(f["Fecha de inicio"]).toISOString() : undefined,
    };
  });
  const propCount = await batchUpsert("properties", propRows, "airtable_id");

  const propsDB = await fetchAllSupa<{ id: string; airtable_id: string }>("properties", "id,airtable_id");
  const propMap = new Map<string, string>(propsDB.map(p => [p.airtable_id, p.id]));
  console.log(`   ✓ ${propCount} properties\n`);

  // ── Step 4: Contacts ──────────────────────────────────────────────────────
  console.log("3/5  Contacts...");
  const contactRows: any[]      = [];
  const contactAgentRows: any[] = [];
  const roleRows: any[]         = [];

  for (const r of atClientes) {
    const f      = r.fields;
    const tipo   = str(f["Tipo de cliente"]);
    const pIds   = arr(f["Propiedad asociada"]);
    const cIds   = arr(f["Inmuebles/ comprador"]);
    const aIds   = arr(f["Propiedad asociada alquiler"]);
    const agATs  = arr(f["Agentes (tabla agentes)"]);
    const agSupa = agATs[0] ? agentMap.get(agATs[0]) ?? null : null;

    contactRows.push({
      nombre:           str(f["Nombre"]) || "Sin nombre",
      telefono:         str(f["Teléfono"]),
      email:            str(f["Email"]),
      dni:              str(f["DNI"]),
      profesion:        str(f["Profesión"]),
      ciclo_vida:       mapCicloVida(tipo, pIds, cIds, aIds),
      motivo:           str(f["Motivo de la llamada"]),
      solicitud:        str(f["Solicitud de llamada"]),
      conversaciones:   str(f["Conversaciones"]),
      observaciones:    str(f["Observaciones"]),
      feedback:         str(f["Feedback Comercial"]),
      seccion:          str(f["Seccion"]),
      trabajado:        str(f["Trabajado"]),
      categoria:        arr(f["Categoría"]),
      contrato_trabajo: str(f["Dispones de contrato de trabajo"]),
      mascota:          str(f["¿Tiene mascota?"]),
      avalista:         str(f["¿Dispones de avalista en caso de ser necesario?"]),
      attachments:      mapAttachments(f["Attachments"]),
      airtable_id:      r.id,
      created_at:       f["Fecha"] ? new Date(f["Fecha"]).toISOString() : r.createdTime,
    });

    // Collect agent assignments (need contact supa id — resolved after insert)
    for (const aid of agATs) {
      const aSupaId = agentMap.get(aid);
      if (aSupaId) contactAgentRows.push({ _at: r.id, agent_id: aSupaId });
    }

    // Collect roles
    if (tipo === "Propietario" || pIds.length > 0) {
      roleRows.push({ _at: r.id, tipo: "Propietario", property_id: pIds[0] ? propMap.get(pIds[0]) ?? null : null, agente_id: agSupa });
    }
    if (tipo === "Comprador" || cIds.length > 0) {
      roleRows.push({ _at: r.id, tipo: "Comprador", property_id: cIds[0] ? propMap.get(cIds[0]) ?? null : null, agente_id: agSupa });
    }
    if (aIds.length > 0) {
      roleRows.push({ _at: r.id, tipo: "Inquilino", property_id: propMap.get(aIds[0]) ?? null, agente_id: agSupa });
    }
  }

  const contactCount = await batchUpsert("contacts", contactRows, "airtable_id");

  // build contact id map (paginated)
  const contactsDB = await fetchAllSupa<{ id: string; airtable_id: string }>("contacts", "id,airtable_id");
  const contactMap = new Map<string, string>(contactsDB.map(c => [c.airtable_id, c.id]));
  console.log(`   ✓ ${contactCount} contacts\n`);

  // ── Step 5: Contact agents + roles ────────────────────────────────────────
  console.log("4/5  Roles & agent assignments...");

  const resolvedAgentRows = contactAgentRows
    .map(r => ({ contact_id: contactMap.get(r._at), agent_id: r.agent_id }))
    .filter(r => r.contact_id);

  const resolvedRoleRows = roleRows
    .map(r => ({ contact_id: contactMap.get(r._at), tipo: r.tipo, estado: "Activo", property_id: r.property_id, agente_id: r.agente_id }))
    .filter(r => r.contact_id);

  // contact_agents uses composite PK — insert ignore duplicates
  let caCount = 0;
  for (let i = 0; i < resolvedAgentRows.length; i += CHUNK) {
    const chunk = resolvedAgentRows.slice(i, i + CHUNK);
    const { error } = await supa.from("contact_agents").upsert(chunk, { onConflict: "contact_id,agent_id", ignoreDuplicates: true });
    if (!error) caCount += chunk.length;
  }

  const roleCount = await batchInsert("contact_roles", resolvedRoleRows);
  console.log(`   ✓ ${caCount} agent assignments, ${roleCount} roles\n`);

  // ── Step 6: Visits ────────────────────────────────────────────────────────
  console.log("5/5  Visits...");
  const visitRows = atVisitas
    .filter(r => r.fields["Fecha y Hora"])
    .map(r => {
      const f = r.fields;
      return {
        property_id: arr(f["Inmuebles"])[0] ? propMap.get(arr(f["Inmuebles"])[0]) ?? null : null,
        contact_id:  arr(f["Clientes"])[0]  ? contactMap.get(arr(f["Clientes"])[0]) ?? null : null,
        agente_id:   arr(f["Agentes"])[0]   ? agentMap.get(arr(f["Agentes"])[0]) ?? null   : null,
        fecha:       new Date(f["Fecha y Hora"]).toISOString(),
        estado:      ({ Confirmada:"Programada", Pendiente:"Programada", Completado:"Realizada", Anulada:"Cancelada", Borrada:"Cancelada" }[str(f["Estado"])] ?? "Realizada"),
        notas:       str(f["Comentarios"]),
        airtable_id: r.id,
      };
    });

  const visitCount = await batchUpsert("visits", visitRows, "airtable_id");
  console.log(`   ✓ ${visitCount} visits\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("══════════════════════════════════");
  console.log(`  Agents:            ${agentCount}`);
  console.log(`  Properties:        ${propCount}`);
  console.log(`  Contacts:          ${contactCount}`);
  console.log(`  Agent assignments: ${caCount}`);
  console.log(`  Roles:             ${roleCount}`);
  console.log(`  Visits:            ${visitCount}`);
  console.log(`  Total time:        ${total}s`);
  console.log("══════════════════════════════════");
  console.log("✅  Done!\n");
}

main().catch(e => { console.error("❌ Failed:", e); process.exit(1); });
