/**
 * Edge Function: sync-properties v26
 *
 * Sin @supabase/supabase-js — fetch() nativo a PostgREST + Storage.
 * NO sube imágenes nuevas (las maneja el script local o el próximo cron).
 * Solo: Fase 1 upsert metadata + Fase 2 reordenado de imagenes.
 *
 * Auth: header `x-cron-secret` verificado via RPC verify_cron_secret(p_value).
 *       El secreto vive únicamente en Vault — nunca viaja como respuesta.
 *       Rotación futura: solo actualizar cron_secret en Vault.
 */

const AIRTABLE_KEY = Deno.env.get("AIRTABLE_KEY") ?? "";
const AIRTABLE_BASE = "appJHlqz7fFFjJWF1";
const AIRTABLE_TBL = "tblLEsYvGZqXntJo7";
const BUCKET = "property-images";
const BATCH_SIZE = 50;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DB_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "apikey": SERVICE_KEY,
  "Prefer": "return=minimal",
};

const ALQUILER_TYPES = new Set([
  "alquiler piso",
  "alquiler chalet",
  "alquiler local",
  "alquiler oficina",
  "alquiler garaje",
]);

function normalizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9\-_.]/g, "_");
}

// deno-lint-ignore no-explicit-any
function toInt(v: any): number | null {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}
// deno-lint-ignore no-explicit-any
function toFloat(v: any): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}
function clean(v: unknown): string {
  return v == null ? "" : String(v).trim();
}
function yesno(v: unknown): string {
  return v == null ? "" : String(v).trim().toLowerCase();
}

// deno-lint-ignore no-explicit-any
function mapRecord(rec: any): Record<string, unknown> {
  const f = rec.fields ?? {};
  const typ = clean(f["Tipo de inmueble (desplegable)"]);
  const orientacion = Array.isArray(f["Orientación"])
    ? (f["Orientación"] as string[]).join(", ")
    : null;

  return {
    airtable_id: rec.id,
    ref: clean(f["Ref"]) || null,
    calle: clean(f["Calle"]) || null,
    numero: clean(f["Numero"]) || null,
    piso: clean(f["Planta"]) || null,
    barrio: clean(f["Barrio"]) || null,
    localidad: clean(f["Localidad"]) || null,
    tipo: typ || null,
    es_alquiler: ALQUILER_TYPES.has(typ.toLowerCase()),
    precio: toFloat(f["Precio"]),
    precio_final: toFloat(f["Precio Final "]) ?? toFloat(f["Precio Final"]),
    habitaciones: toInt(f["Habitaciones / dormitorios"]),
    banos: toInt(f["Baño"]),
    metros_construidos: toFloat(f["Superficie"]),
    estatus: clean(f["Estatus"]) || "Activo",
    estado: clean(f["Estado"]),
    publicacion: (() => {
      const pub = clean(f["Publicación"]) || "SUBIR";
      const est = clean(f["Estatus"]);
      return est !== "Activo" && pub === "PUBLICADO" ? "" : pub;
    })(),
    orientacion,
    descripcion: f["Descripción"] ?? null,
    fecha_inicio: f["Fecha de inicio"] ?? null,
    fecha_exclusiva: f["Fecha de autorización de venta ( exclusiva)"] ?? null,
    fecha_reserva: f["Fecha Reserva"] ?? null,
    fecha_escritura: f["Fecha Escritura"] ?? null,
    fecha_fin_exclusiva: f["Fecha fin de exclusividad"] ?? null,
    certificacion_energetica: clean(f["Certificación energética"]),
    ano_construccion: clean(f["Año de construcción"]),
    gastos_comunidad: clean(f["Gastos de comunidad"]),
    calefaccion: clean(f["Calefacción"]),
    garaje: yesno(f["Garaje"]),
    trastero: yesno(f["Trastero"]),
    ascensor: yesno(f["Ascensor"]),
    armarios_empotrados: yesno(f["Armarios empotrados"]),
    terraza: clean(f["Terraza"]),
    balcon: clean(f["Balcón"]),
    referencia_catastral: clean(f["Referencia Catastral"]),
    honorarios: clean(f["Honorarios"]),
    tipo_exclusiva: clean(f["Tipo de exclusiva"]),
    notaria: clean(f["Notaría"]),
    llaves: clean(f["Llaves"]),
    observaciones: clean(f["Observaciones"]),
  };
}

async function dbUpsertBatch(
  rows: Record<string, unknown>[],
  summary: { upserted: number; errors: string[] },
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?on_conflict=airtable_id`,
    {
      method: "POST",
      headers: { ...DB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    },
  );
  if (res.ok) { summary.upserted += rows.length; return; }
  const txt = await res.text();
  if (txt.includes("properties_ref_key")) {
    for (const row of rows) {
      const r1 = await fetch(
        `${SUPABASE_URL}/rest/v1/properties?on_conflict=airtable_id`,
        {
          method: "POST",
          headers: { ...DB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([row]),
        },
      );
      if (r1.ok) { summary.upserted++; continue; }
      const t1 = await r1.text();
      if (t1.includes("properties_ref_key")) {
        // deno-lint-ignore no-explicit-any
        const { ref: _r, ...rowNoRef } = row as any;
        const r2 = await fetch(
          `${SUPABASE_URL}/rest/v1/properties?on_conflict=airtable_id`,
          {
            method: "POST",
            headers: { ...DB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([rowNoRef]),
          },
        );
        if (r2.ok) summary.upserted++;
        else summary.errors.push(`upsert(no-ref) ${row.airtable_id}: ${await r2.text()}`);
      } else {
        summary.errors.push(`upsert ${row.airtable_id}: ${t1}`);
      }
    }
  } else {
    summary.errors.push(`upsert batch: ${txt}`);
    console.error(`upsert error: ${txt}`);
  }
}

async function verifyCronSecret(incoming: string | null): Promise<boolean> {
  if (!incoming) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_cron_secret`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify({ p_value: incoming }),
  });
  return res.ok && (await res.json()) === true;
}

Deno.serve(async (req: Request) => {
  if (!await verifyCronSecret(req.headers.get("x-cron-secret"))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pubBase = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

  const summary = {
    started_at: new Date().toISOString(),
    finished_at: "",
    airtable_fetched: 0,
    upserted: 0,
    images_updated: 0,
    images_skipped_new: 0,
    errors: [] as string[],
  };

  console.log(`[sync-properties v25] start ${summary.started_at}`);

  try {
    // ── Fase 1: Airtable → upsert Supabase ──────────────────────────────────
    const activeImageData: Array<{
      airtableId: string;
      images: Array<{ url: string; filename: string }>;
    }> = [];
    let offset: string | undefined;
    let page = 0;
    let upsertBuffer: Record<string, unknown>[] = [];

    const flushUpsert = async () => {
      if (upsertBuffer.length === 0) return;
      const batch = upsertBuffer.splice(0, upsertBuffer.length);
      await dbUpsertBatch(batch, summary);
    };

    const filter = encodeURIComponent(
      `OR({Estatus}='Activo', IS_AFTER(LAST_MODIFIED_TIME(), DATEADD(TODAY(), -7, 'days')))`,
    );

    do {
      page++;
      let url =
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TBL}?pageSize=100&filterByFormula=${filter}`;
      if (offset) url += `&offset=${encodeURIComponent(offset)}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_KEY}` } });
      if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);

      // deno-lint-ignore no-explicit-any
      const data = (await res.json()) as { records: any[]; offset?: string };
      summary.airtable_fetched += data.records.length;
      console.log(`  pág ${page}: ${data.records.length} → total ${summary.airtable_fetched}`);

      for (const rec of data.records) {
        upsertBuffer.push(mapRecord(rec));
        if (clean(rec.fields?.["Estatus"]) === "Activo") {
          // deno-lint-ignore no-explicit-any
          const imgs = ((rec.fields?.["Imágenes"] as any[]) ?? []).map((a) => ({
            url: a.url as string,
            filename: a.filename as string,
          }));
          if (imgs.length > 0) activeImageData.push({ airtableId: rec.id, images: imgs });
        }
        if (upsertBuffer.length >= BATCH_SIZE) await flushUpsert();
      }
      offset = data.offset;
    } while (offset);

    await flushUpsert();
    console.log(`Fase 1: ${summary.upserted} upserted, ${activeImageData.length} activos con imgs`);

    // ── Fase 2: reordenar imagenes según orden Airtable (sin subir nuevos) ───
    const activeAtIds = activeImageData.map((d) => d.airtableId);
    const ids = activeAtIds.join(",");
    const selectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?select=id,airtable_id,imagenes&airtable_id=in.(${ids})&limit=500`,
      { headers: { ...DB_HEADERS, "Prefer": "return=representation" } },
    );
    if (!selectRes.ok) throw new Error(`dbSelect ${selectRes.status}: ${await selectRes.text()}`);
    const props = await selectRes.json() as Array<{
      id: string;
      airtable_id: string;
      imagenes: Array<{ url: string; filename: string }>;
    }>;

    const propMap = new Map(
      props.map((p) => [p.airtable_id, { id: p.id, imagenes: p.imagenes ?? [] }]),
    );

    const pendingUpdates: Promise<void>[] = [];

    for (const { airtableId, images } of activeImageData) {
      const prop = propMap.get(airtableId);
      if (!prop) continue;
      const { id: propId, imagenes: currentImagenes } = prop;

      const storedMap = new Map<string, string>(
        currentImagenes.map((img) => {
          const basename = img.filename.replace(/^\d{3}_/, "");
          return [normalizeFilename(basename), img.filename];
        }),
      );

      const mappedNames = images.map(({ filename }) =>
        storedMap.get(normalizeFilename(filename)) ?? null
      );

      const hasNewFiles = mappedNames.some((n) => n === null);
      if (hasNewFiles) {
        // Skip upload — handled by daily cron or local script
        summary.images_skipped_new++;
      }

      const currentOrder = currentImagenes.map((img) => img.filename);
      const targetOrder = mappedNames.filter(Boolean) as string[];

      // Already correct order → skip
      if (
        !hasNewFiles &&
        currentOrder.length === targetOrder.length &&
        currentOrder.every((name, i) => name === targetOrder[i])
      ) continue;

      // Rebuild imagenes in Airtable order (existing files only)
      const newImagenes = images
        .filter(({ filename }) => storedMap.has(normalizeFilename(filename)))
        .map(({ filename }) => {
          const storageName = storedMap.get(normalizeFilename(filename))!;
          return {
            url: `${pubBase}/${propId}/${encodeURIComponent(storageName)}`,
            filename: storageName,
          };
        });

      const pid = propId;
      pendingUpdates.push(
        fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${pid}`, {
          method: "PATCH",
          headers: DB_HEADERS,
          body: JSON.stringify({ imagenes: newImagenes }),
        }).then(async (r) => {
          if (r.ok) summary.images_updated++;
          else summary.errors.push(`imagenes ${pid}: ${await r.text()}`);
        }),
      );
    }

    await Promise.all(pendingUpdates);

    summary.finished_at = new Date().toISOString();
    console.log(`[sync-properties v25] done: ${JSON.stringify(summary)}`);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    summary.errors.push(String(e));
    summary.finished_at = new Date().toISOString();
    console.error(`[sync-properties v25] fatal: ${e}`);
    return new Response(JSON.stringify(summary), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
