// ⚠️  NO EJECUTAR — archivado el 19 ago 2026 (hallazgo H-09, auditoría Codex 14 ago 2026).
// Script de importación/reparación de una sola vez de la era Airtable, ya migrada.
// Corre con service_role, sin modo dry-run obligatorio, sin transacción/backup,
// y puede apuntar al proyecto ESGI real por variables de entorno. Si algún día hace
// falta reutilizar su lógica: exigir confirmación explícita, dry-run, snapshot previo
// y aprobación de David antes de tocar producción.

/**
 * Fix FK links for visits and contact_roles that were broken due to the
 * migration script not paginating the contactMap / propMap fetches.
 *
 * Run: npx tsx supabase/fix-fk-links.ts
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

const supa  = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const CHUNK = 500;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const str = (v: unknown): string => {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join(", ");
  return String(v).trim();
};
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : [];

// ── Fetch all pages from a Supabase table ─────────────────────────────────────
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

// ── Fetch all pages from Airtable ─────────────────────────────────────────────
async function fetchAllAirtable(tableId: string): Promise<any[]> {
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

async function main() {
  console.log("🔧  Fix FK links (visits + contact_roles)\n");
  const t0 = Date.now();

  // ── Step 1: Build full ID maps from Supabase (paginated) ──────────────────
  console.log("1/4  Building full ID maps from Supabase...");
  const [agentsDB, propsDB, contactsDB] = await Promise.all([
    fetchAllSupa<{ id: string; airtable_id: string }>("agents",   "id,airtable_id"),
    fetchAllSupa<{ id: string; airtable_id: string }>("properties","id,airtable_id"),
    fetchAllSupa<{ id: string; airtable_id: string }>("contacts",  "id,airtable_id"),
  ]);
  const agentMap   = new Map(agentsDB.map(r   => [r.airtable_id, r.id]));
  const propMap    = new Map(propsDB.map(r    => [r.airtable_id, r.id]));
  const contactMap = new Map(contactsDB.map(r => [r.airtable_id, r.id]));
  console.log(`   agents: ${agentMap.size}, properties: ${propMap.size}, contacts: ${contactMap.size}\n`);

  // ── Step 2: Fix visit FKs ──────────────────────────────────────────────────
  console.log("2/4  Fetching Airtable visits...");
  const atVisitas = await fetchAllAirtable("tblBN7MsFyKLyn1UJ");
  const visitsWithLinks = atVisitas.filter(
    r => r.fields["Fecha y Hora"] && (r.fields["Inmuebles"] || r.fields["Clientes"])
  );
  console.log(`   ${atVisitas.length} total, ${visitsWithLinks.length} have at least one link\n`);

  console.log("3/4  Updating visit FKs...");
  let visitFixed = 0;
  for (let i = 0; i < visitsWithLinks.length; i += CHUNK) {
    const chunk = visitsWithLinks.slice(i, i + CHUNK);
    // Build update payloads grouped by what changed
    for (const r of chunk) {
      const f = r.fields;
      const property_id = arr(f["Inmuebles"])[0] ? propMap.get(arr(f["Inmuebles"])[0]) ?? null : null;
      const contact_id  = arr(f["Clientes"])[0]  ? contactMap.get(arr(f["Clientes"])[0]) ?? null : null;
      const { error } = await supa.from("visits")
        .update({ property_id, contact_id })
        .eq("airtable_id", r.id);
      if (error) console.warn(`  visit ${r.id}: ${error.message}`);
      else visitFixed++;
    }
  }
  console.log(`   ✓ Updated ${visitFixed} visits\n`);

  // ── Step 3: Fix contact_roles ──────────────────────────────────────────────
  console.log("4/4  Rebuilding contact_roles from Airtable...");

  // Delete all existing roles first
  const { error: delErr } = await supa.from("contact_roles").delete().gte("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) { console.error("Failed to delete contact_roles:", delErr.message); process.exit(1); }
  console.log("   Cleared contact_roles table");

  const atClientes = await fetchAllAirtable("tbl4N1uR3A3XMwsqZ");
  const roleRows: any[] = [];

  for (const r of atClientes) {
    const f    = r.fields;
    const tipo = str(f["Tipo de cliente"]);
    const pIds = arr(f["Propiedad asociada"]);
    const cIds = arr(f["Inmuebles/ comprador"]);
    const aIds = arr(f["Propiedad asociada alquiler"]);
    const agAT = arr(f["Agentes (tabla agentes)"])[0];

    const contactId = contactMap.get(r.id);
    if (!contactId) continue;

    const agSupa = agAT ? agentMap.get(agAT) ?? null : null;

    if (tipo === "Propietario" || pIds.length > 0) {
      roleRows.push({
        contact_id: contactId,
        tipo: "Propietario",
        estado: "Activo",
        property_id: pIds[0] ? propMap.get(pIds[0]) ?? null : null,
        agente_id: agSupa,
      });
    }
    if (tipo === "Comprador" || cIds.length > 0) {
      roleRows.push({
        contact_id: contactId,
        tipo: "Comprador",
        estado: "Activo",
        property_id: cIds[0] ? propMap.get(cIds[0]) ?? null : null,
        agente_id: agSupa,
      });
    }
    if (aIds.length > 0) {
      roleRows.push({
        contact_id: contactId,
        tipo: "Inquilino",
        estado: "Activo",
        property_id: propMap.get(aIds[0]) ?? null,
        agente_id: agSupa,
      });
    }
  }

  // Deduplicate by (contact_id, tipo) before inserting
  const seenRoles = new Set<string>();
  const uniqueRoles = roleRows.filter(r => {
    const k = `${r.contact_id}|${r.tipo}`;
    if (seenRoles.has(k)) return false;
    seenRoles.add(k);
    return true;
  });

  // Batch insert
  let roleCount = 0;
  for (let i = 0; i < uniqueRoles.length; i += CHUNK) {
    const chunk = uniqueRoles.slice(i, i + CHUNK);
    const { error } = await supa.from("contact_roles").insert(chunk);
    if (error) console.warn(`  roles batch ${i / CHUNK + 1}: ${error.message}`);
    else roleCount += chunk.length;
  }
  console.log(`   ✓ Inserted ${roleCount} roles\n`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("══════════════════════════════════");
  console.log(`  Visit FKs fixed: ${visitFixed}`);
  console.log(`  Roles inserted:  ${roleCount}`);
  console.log(`  Total time:      ${elapsed}s`);
  console.log("══════════════════════════════════");
  console.log("✅  Done!\n");
}

main().catch(e => { console.error("❌ Failed:", e); process.exit(1); });
