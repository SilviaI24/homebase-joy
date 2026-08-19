/**
 * Airtable images → Supabase Storage migration
 *
 * Fetches fresh signed URLs from Airtable API, downloads each image,
 * uploads to Supabase Storage (bucket: property-images), and updates
 * the properties.imagenes column with permanent public URLs.
 *
 * Run:
 *   AIRTABLE_API_KEY=xxx SUPABASE_SERVICE_KEY=yyy npx tsx supabase/migrate-images.ts
 *
 * Or set all vars in .env.local and run:
 *   npx dotenv -e .env.local -- npx tsx supabase/migrate-images.ts
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────
const BASE       = "appJHlqz7fFFjJWF1";
const TABLE_PROPS = "tblLEsYvGZqXntJo7";
const BUCKET     = "property-images";
const CONCURRENCY = 4; // parallel image downloads at a time

const AT_KEY   = process.env.AIRTABLE_API_KEY ?? "";
const SUPA_URL = process.env.SUPABASE_URL ?? "https://fyrfkbcabmitbfuqeccq.supabase.co";
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!AT_KEY)   { console.error("❌  Missing AIRTABLE_API_KEY"); process.exit(1); }
if (!SUPA_KEY) { console.error("❌  Missing SUPABASE_SERVICE_KEY"); process.exit(1); }

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Att = {
  id?: string;
  url?: string;
  filename?: string;
  type?: string;
  thumbnails?: { large?: { url?: string }; full?: { url?: string } };
};

/** Best-quality URL: prefer original, fall back to full/large thumbnail */
const srcUrl = (a: Att): string =>
  a.url ?? a.thumbnails?.full?.url ?? a.thumbnails?.large?.url ?? "";

/** Fetch all pages from an Airtable table */
async function fetchAirtable(tableId: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${tableId}?${params}`, {
      headers: { Authorization: `Bearer ${AT_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable ${tableId} error ${res.status}: ${text}`);
    }
    const json = await res.json() as { records: any[]; offset?: string };
    records.push(...json.records);
    offset = json.offset;
    if (offset) await sleep(200);
  } while (offset);
  return records;
}

/** Fetch all rows from a Supabase table (handles >1000 rows) */
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

/** Run tasks with limited concurrency */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = await tasks[i](); }
      catch (e) { results[i] = null; }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log("🚀  Airtable images → Supabase Storage\n");

  // 1. Ensure bucket exists and is public
  console.log(`Checking bucket "${BUCKET}"...`);
  const { data: buckets } = await supa.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    const { error } = await supa.storage.createBucket(BUCKET, { public: true });
    if (error) throw new Error(`Cannot create bucket: ${error.message}`);
    console.log(`  ✓ Created bucket (public)\n`);
  } else {
    // Make sure it's public
    await supa.storage.updateBucket(BUCKET, { public: true });
    console.log(`  ✓ Bucket exists (public)\n`);
  }

  // 2. Load Supabase properties (need id ↔ airtable_id mapping)
  console.log("Loading properties from Supabase...");
  const supaProps = await fetchAllSupa<{ id: string; airtable_id: string; ref: string }>(
    "properties", "id,airtable_id,ref"
  );
  const supaMap = new Map(supaProps.map(p => [p.airtable_id, p]));
  console.log(`  ✓ ${supaProps.length} properties loaded\n`);

  // 3. Fetch properties from Airtable — this gives FRESH signed URLs
  console.log("Fetching properties from Airtable (fresh URLs)...");
  const atProps = await fetchAirtable(TABLE_PROPS);
  const withImages = atProps.filter(r => {
    const imgs = r.fields["Imágenes"];
    return Array.isArray(imgs) && imgs.length > 0;
  });
  console.log(`  ✓ ${atProps.length} properties fetched, ${withImages.length} have images\n`);

  // 4. Migrate images
  let totalImages = 0;
  let totalErrors = 0;
  let propertiesUpdated = 0;

  console.log("Migrating images...\n");

  for (const r of withImages) {
    const supaProp = supaMap.get(r.id);
    if (!supaProp) {
      console.warn(`  ⚠  Airtable record ${r.id} not found in Supabase — skipping`);
      continue;
    }

    const atImages: Att[] = r.fields["Imágenes"] as Att[];
    const label = supaProp.ref ? `#${supaProp.ref}` : supaProp.id.slice(0, 8);

    // Build upload tasks for this property
    const tasks = atImages.map((att, i) => async (): Promise<{ url: string; filename: string; orden: number } | null> => {
      const url = srcUrl(att);
      if (!url) return null;

      const rawFilename = att.filename ?? `image_${i}.jpg`;
      // Sanitize filename: remove special chars, keep extension
      const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${supaProp.id}/${String(i).padStart(3, "0")}_${safeFilename}`;

      // Download from Airtable (fresh signed URL)
      let imgBuffer: ArrayBuffer;
      let contentType: string;
      try {
        const imgRes = await fetch(url, { redirect: "follow" });
        if (!imgRes.ok) {
          console.warn(`    ✗ ${label} img${i}: HTTP ${imgRes.status}`);
          totalErrors++;
          return null;
        }
        imgBuffer = await imgRes.arrayBuffer();
        contentType = imgRes.headers.get("content-type") ?? att.type ?? "image/jpeg";
      } catch (e) {
        console.warn(`    ✗ ${label} img${i}: download failed —`, (e as Error).message);
        totalErrors++;
        return null;
      }

      // Upload to Supabase Storage
      const { error: uploadError } = await supa.storage
        .from(BUCKET)
        .upload(storagePath, imgBuffer, { contentType, upsert: true });

      if (uploadError) {
        console.warn(`    ✗ ${label} img${i}: upload failed —`, uploadError.message);
        totalErrors++;
        return null;
      }

      // Get permanent public URL
      const { data: { publicUrl } } = supa.storage.from(BUCKET).getPublicUrl(storagePath);
      totalImages++;
      return { url: publicUrl, filename: rawFilename, orden: i };
    });

    // Run with concurrency limit
    const results = await withConcurrency(tasks, CONCURRENCY);
    const newImagenes = results.filter((r): r is { url: string; filename: string; orden: number } => r !== null);

    if (newImagenes.length === 0) {
      console.log(`  ⚠  ${label}: no images could be migrated`);
      continue;
    }

    // Update Supabase row
    const { error: updateError } = await supa
      .from("properties")
      .update({ imagenes: newImagenes })
      .eq("id", supaProp.id);

    if (updateError) {
      console.warn(`  ✗ ${label}: DB update failed —`, updateError.message);
      totalErrors++;
    } else {
      propertiesUpdated++;
      console.log(`  ✓ ${label}: ${newImagenes.length}/${atImages.length} images`);
    }

    // Tiny pause to avoid hammering
    await sleep(50);
  }

  // 5. Summary
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n══════════════════════════════════════");
  console.log(`  Properties with images: ${withImages.length}`);
  console.log(`  Properties updated:     ${propertiesUpdated}`);
  console.log(`  Images migrated:        ${totalImages}`);
  console.log(`  Errors:                 ${totalErrors}`);
  console.log(`  Time:                   ${elapsed}s`);
  console.log("══════════════════════════════════════");
  console.log("✅  Done!\n");
}

main().catch(e => { console.error("❌  Fatal:", e); process.exit(1); });
