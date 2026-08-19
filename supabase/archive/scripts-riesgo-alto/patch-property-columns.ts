/**
 * Patch existing properties in Supabase with new column data from Airtable.
 * Run after add-property-columns.sql has been executed.
 * Run: npx tsx supabase/patch-property-columns.ts
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const str = (v: unknown): string => {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join(", ");
  return String(v).trim();
};
const date = (v: unknown): string | null => {
  if (!v) return null;
  try { return new Date(String(v)).toISOString().slice(0, 10); }
  catch { return null; }
};

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

async function main() {
  console.log("🔧  Patching property columns from Airtable...\n");

  console.log("Fetching Airtable properties...");
  const atProps = await fetchAll("tblLEsYvGZqXntJo7");
  console.log(`   ${atProps.length} records\n`);

  console.log("Fetching Supabase airtable_id → id map...");
  const propsDB = await fetchAllSupa<{ id: string; airtable_id: string }>("properties", "id,airtable_id");
  const propMap = new Map<string, string>(propsDB.map(p => [p.airtable_id, p.id]));
  console.log(`   ${propsDB.length} properties in Supabase\n`);

  let updated = 0, skipped = 0;
  const CHUNK = 50;
  const updates: Array<{ id: string; [k: string]: unknown }> = [];

  for (const r of atProps) {
    const supaId = propMap.get(r.id);
    if (!supaId) { skipped++; continue; }
    const f = r.fields;
    updates.push({
      id:                       supaId,
      publicacion:              str(f["Publicación"]),
      estado:                   str(f["Estado"]),
      fecha_inicio:             date(f["Fecha de inicio"]),
      fecha_reserva:            date(f["Fecha Reserva"]),
      fecha_escritura:          date(f["Fecha de Escritura"]) || date(f["Fecha Escritura"]) || null,
      fecha_exclusiva:          date(f["Fecha de autorización de venta ( exclusiva)"]),
      fecha_fin_exclusiva:      date(f["Fecha fin exclusiva"]) || date(f["Fecha Fin Exclusiva"]) || null,
      certificacion_energetica: str(f["Certificación energética"]),
      ano_construccion:         str(f["Año de construcción"]),
      gastos_comunidad:         str(f["Gastos de comunidad"]) || str(f["Gastos Comunidad"]),
      calefaccion:              str(f["Calefacción"]),
      garaje:                   str(f["Garaje"]),
      trastero:                 str(f["Trastero"]),
      ascensor:                 str(f["Ascensor"]),
      armarios_empotrados:      str(f["Armarios empotrados"]),
      terraza:                  str(f["Terraza"]),
      balcon:                   str(f["Balcón"]) || str(f["Balcon"]),
      referencia_catastral:     str(f["Referencia catastral"]) || str(f["Referencia Catastral"]),
      honorarios:               str(f["Honorarios"]),
      tipo_exclusiva:           str(f["Tipo de exclusiva"]) || str(f["Tipo exclusiva"]),
      notaria:                  str(f["Notaría"]) || str(f["Notaria"]),
      llaves:                   str(f["Llaves"]),
      observaciones:            str(f["Observaciones"]),
    });
  }

  console.log(`Updating ${updates.length} properties in batches of ${CHUNK}...`);
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    for (const row of chunk) {
      const { id, ...patch } = row;
      const { error } = await supa.from("properties").update(patch).eq("id", id);
      if (error) console.warn(`  [${id}] ${error.message}`);
      else updated++;
    }
    if (i % 200 === 0 && i > 0) console.log(`   ${updated}/${updates.length}...`);
  }

  console.log(`\n✅  Done. Updated: ${updated}, skipped (no airtable_id match): ${skipped}`);
}

main().catch(e => { console.error(e); process.exit(1); });
