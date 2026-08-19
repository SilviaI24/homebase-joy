// ⚠️  NO EJECUTAR — archivado el 19 ago 2026 (hallazgo H-09, auditoría Codex 14 ago 2026).
// Script de importación/reparación de una sola vez de la era Airtable, ya migrada.
// Corre con service_role, sin modo dry-run obligatorio, sin transacción/backup,
// y puede apuntar al proyecto ESGI real por variables de entorno. Si algún día hace
// falta reutilizar su lógica: exigir confirmación explícita, dry-run, snapshot previo
// y aprobación de David antes de tocar producción.

/**
 * Airtable documents → Supabase Storage migration
 *
 * Run:
 *   node --env-file=.env.local --no-warnings $(which npx) tsx supabase/migrate-documents.ts
 */

import { createClient } from "@supabase/supabase-js";

const BASE        = "appJHlqz7fFFjJWF1";
const TABLE_PROPS = "tblLEsYvGZqXntJo7";
const BUCKET      = "property-docs";
const CONCURRENCY = 4;

const AT_KEY   = process.env.AIRTABLE_API_KEY ?? "";
const SUPA_URL = process.env.SUPABASE_URL ?? "https://fyrfkbcabmitbfuqeccq.supabase.co";
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!AT_KEY)   { console.error("❌  Missing AIRTABLE_API_KEY"); process.exit(1); }
if (!SUPA_KEY) { console.error("❌  Missing SUPABASE_SERVICE_KEY"); process.exit(1); }

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Att = { url?: string; filename?: string; type?: string };

async function fetchAirtable(tableId: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${tableId}?${params}`, {
      headers: { Authorization: `Bearer ${AT_KEY}` },
    });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
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
  while (true) {
    const { data, error } = await supa.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`[${table}] ${error.message}`);
    results.push(...(data as T[]));
    if ((data?.length ?? 0) < 1000) break;
    from += 1000;
  }
  return results;
}

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = await tasks[i](); } catch { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function main() {
  const t0 = Date.now();
  console.log("🚀  Airtable documents → Supabase Storage\n");

  // Ensure bucket
  const { data: buckets } = await supa.storage.listBuckets();
  if (!buckets?.some(b => b.name === BUCKET)) {
    const { error } = await supa.storage.createBucket(BUCKET, { public: true });
    if (error) throw new Error(`Cannot create bucket: ${error.message}`);
    console.log(`  ✓ Created bucket "${BUCKET}" (public)\n`);
  } else {
    await supa.storage.updateBucket(BUCKET, { public: true });
    console.log(`  ✓ Bucket "${BUCKET}" exists\n`);
  }

  // Load Supabase properties
  console.log("Loading properties from Supabase...");
  const supaProps = await fetchAllSupa<{ id: string; airtable_id: string; ref: string }>("properties", "id,airtable_id,ref");
  const supaMap = new Map(supaProps.map(p => [p.airtable_id, p]));
  console.log(`  ✓ ${supaProps.length} properties\n`);

  // Fetch from Airtable (fresh URLs)
  console.log("Fetching from Airtable...");
  const atProps = await fetchAirtable(TABLE_PROPS);
  const withDocs = atProps.filter(r => {
    const d = r.fields["Documentación"];
    return Array.isArray(d) && d.length > 0;
  });
  console.log(`  ✓ ${atProps.length} fetched, ${withDocs.length} have documents\n`);

  let totalDocs = 0, totalErrors = 0, propsUpdated = 0;
  console.log("Migrating documents...\n");

  for (const r of withDocs) {
    const supaProp = supaMap.get(r.id);
    if (!supaProp) continue;

    const atDocs: Att[] = r.fields["Documentación"] as Att[];
    const label = supaProp.ref ? `#${supaProp.ref}` : supaProp.id.slice(0, 8);

    const tasks = atDocs.map((att, i) => async (): Promise<{ url: string; filename: string; type: string } | null> => {
      const url = att.url ?? "";
      if (!url) return null;

      const rawFilename = att.filename ?? `doc_${i}.pdf`;
      const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${supaProp.id}/${String(i).padStart(3, "0")}_${safeFilename}`;
      const contentType = att.type ?? "application/octet-stream";

      let buf: ArrayBuffer;
      try {
        const res = await fetch(url, { redirect: "follow" });
        if (!res.ok) { totalErrors++; return null; }
        buf = await res.arrayBuffer();
      } catch { totalErrors++; return null; }

      const { error } = await supa.storage.from(BUCKET).upload(storagePath, buf, { contentType, upsert: true });
      if (error) { totalErrors++; return null; }

      const { data: { publicUrl } } = supa.storage.from(BUCKET).getPublicUrl(storagePath);
      totalDocs++;
      return { url: publicUrl, filename: rawFilename, type: contentType };
    });

    const results = await withConcurrency(tasks, CONCURRENCY);
    const newDocs = results.filter((r): r is { url: string; filename: string; type: string } => r !== null);

    if (newDocs.length === 0) { console.log(`  ⚠  ${label}: no docs migrated`); continue; }

    const { error } = await supa.from("properties").update({ documentos: newDocs }).eq("id", supaProp.id);
    if (error) { console.warn(`  ✗ ${label}: update failed`); totalErrors++; }
    else { propsUpdated++; console.log(`  ✓ ${label}: ${newDocs.length}/${atDocs.length} docs`); }

    await sleep(50);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n══════════════════════════════════════");
  console.log(`  Properties with docs: ${withDocs.length}`);
  console.log(`  Properties updated:   ${propsUpdated}`);
  console.log(`  Documents migrated:   ${totalDocs}`);
  console.log(`  Errors:               ${totalErrors}`);
  console.log(`  Time:                 ${elapsed}s`);
  console.log("══════════════════════════════════════");
  console.log("✅  Done!\n");
}

main().catch(e => { console.error("❌  Fatal:", e); process.exit(1); });
