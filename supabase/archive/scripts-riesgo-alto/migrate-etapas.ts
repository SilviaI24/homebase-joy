// ⚠️  NO EJECUTAR — archivado el 19 ago 2026 (hallazgo H-09, auditoría Codex 14 ago 2026).
// Script de importación/reparación de una sola vez de la era Airtable, ya migrada.
// Corre con service_role, sin modo dry-run obligatorio, sin transacción/backup,
// y puede apuntar al proyecto ESGI real por variables de entorno. Si algún día hace
// falta reutilizar su lógica: exigir confirmación explícita, dry-run, snapshot previo
// y aprobación de David antes de tocar producción.

/**
 * Backfill ciclo_vida based on contact_roles + property statuses.
 *
 * Rules:
 *   Descartado  → leave as-is
 *   Prospecto   → leave as-is (property captación targets, shown under Inmuebles/Captación)
 *   Otherwise:
 *     has any linked property with estatus NOT IN (Vendido, Alquilado, Baja) → 'Activo'
 *     has linked properties, all closed (Vendido / Alquilado)                → 'Histórico'
 *     no linked properties                                                   → 'Lead'
 *
 * Run: npx tsx supabase/migrate-etapas.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const CLOSED_STATUSES = new Set(["Vendido", "Alquilado"]);
const INACTIVE_STATUSES = new Set(["Vendido", "Alquilado", "Baja"]);

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const results: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa.from(table).select(select).range(from, from + PAGE - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    results.push(...(data as T[]));
    if ((data?.length ?? 0) < PAGE) break;
    from += PAGE;
  }
  return results;
}

async function main() {
  console.log("Fetching contacts...");
  const contacts = await fetchAll<{ id: string; ciclo_vida: string }>(
    "contacts",
    "id, ciclo_vida"
  );
  console.log(`  ${contacts.length} contacts`);

  console.log("Fetching contact_roles with property statuses...");
  const roles = await fetchAll<{ contact_id: string; property_id: string | null; properties: { estatus: string } | null }>(
    "contact_roles",
    "contact_id, property_id, properties(estatus)"
  );
  console.log(`  ${roles.length} roles`);

  // Build map: contact_id → array of property statuses
  const roleMap = new Map<string, string[]>();
  for (const r of roles) {
    const estatus = r.properties?.estatus ?? null;
    if (!estatus) continue;
    const list = roleMap.get(r.contact_id) ?? [];
    list.push(estatus);
    roleMap.set(r.contact_id, list);
  }

  // Compute desired ciclo_vida for each contact
  const updates: Array<{ id: string; ciclo_vida: string }> = [];
  for (const c of contacts) {
    // Never touch Descartado or Prospecto
    if (c.ciclo_vida === "Descartado" || c.ciclo_vida === "Prospecto") continue;

    const statuses = roleMap.get(c.id) ?? [];

    let desired: string;
    if (statuses.length === 0) {
      desired = "Lead";
    } else if (statuses.some((s) => !INACTIVE_STATUSES.has(s))) {
      desired = "Activo";
    } else if (statuses.some((s) => CLOSED_STATUSES.has(s))) {
      desired = "Histórico";
    } else {
      // All Baja — no active, no closed deal
      desired = "Lead";
    }

    if (desired !== c.ciclo_vida) {
      updates.push({ id: c.id, ciclo_vida: desired });
    }
  }

  console.log(`\nContacts to update: ${updates.length}`);
  const breakdown = { Lead: 0, Activo: 0, Histórico: 0 } as Record<string, number>;
  for (const u of updates) breakdown[u.ciclo_vida] = (breakdown[u.ciclo_vida] ?? 0) + 1;
  console.log("  Breakdown:", breakdown);

  if (updates.length === 0) {
    console.log("\nNothing to update. Done.");
    return;
  }

  // Apply in batches
  let done = 0;
  const CHUNK = 100;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    for (const { id, ciclo_vida } of chunk) {
      const { error } = await supa.from("contacts").update({ ciclo_vida }).eq("id", id);
      if (error) console.warn(`  [${id}] ${error.message}`);
      else done++;
    }
    if (done % 500 === 0 && done > 0) console.log(`  ${done}/${updates.length}...`);
  }

  console.log(`\nDone. Updated ${done}/${updates.length} contacts.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
