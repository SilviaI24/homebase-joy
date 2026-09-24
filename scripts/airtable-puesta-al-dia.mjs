// Puesta al día Airtable (Clientes) → CRM. Por defecto SIMULA: no escribe nada.
// Uso: node --env-file=.env.local scripts/airtable-puesta-al-dia.mjs [--desde=2026-06-01] [--apply]
import { createClient } from "@supabase/supabase-js";

const BASE = "appJHlqz7fFFjJWF1";
const TABLA_CLIENTES = "tbl4N1uR3A3XMwsqZ";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DESDE = args.desde ?? "2026-06-01";
const APPLY = args.apply === true;

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const h = { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` };

const str = (v) => (v == null ? "" : String(v).trim());
const tel9 = (t) => str(t).replace(/\D/g, "").slice(-9);

// Sección de Airtable → tipo_interes del CRM. Inversión y Rústica son compra
// pero departamentos distintos (David, 24 sep 2026): el departamento queda en
// contacts.seccion, que se copia tal cual.
const SECCION_A_INTERES = {
  alquiler: "Alquiler",
  prospección: "Prospeccion",
  prospeccion: "Prospeccion",
  inversión: "Compra",
  inversion: "Compra",
  rústica: "Compra",
  rustica: "Compra",
};
const MAPEO_PENDIENTE = new Set();

async function fetchAirtable() {
  const out = [];
  let offset;
  do {
    const p = new URLSearchParams({ pageSize: "100" });
    if (offset) p.set("offset", offset);
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLA_CLIENTES}?${p}`, {
      headers: h,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    out.push(...j.records);
    offset = j.offset;
  } while (offset);
  return out;
}

async function fetchCrm() {
  const ids = new Set(),
    tels = new Set(),
    emails = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa
      .from("contacts")
      .select("airtable_id, telefono, email")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const c of data) {
      if (c.airtable_id) ids.add(c.airtable_id);
      if (tel9(c.telefono).length === 9) tels.add(tel9(c.telefono));
      if (str(c.email)) emails.add(str(c.email).toLowerCase());
    }
    if (data.length < 1000) break;
  }
  return { ids, tels, emails };
}

const tally = (arr) =>
  Object.entries(arr.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})).sort(
    (a, b) => b[1] - a[1],
  );

const [recs, crm] = await Promise.all([fetchAirtable(), fetchCrm()]);
const candidatos = recs.filter((r) => !crm.ids.has(r.id) && r.createdTime >= DESDE);

const dupTel = [],
  dupEmail = [],
  sinContacto = [];
// Airtable crea un registro nuevo cada vez que la misma persona vuelve a
// escribir: se agrupan por teléfono (o email si no hay) en UN contacto, con
// las conversaciones unidas en orden cronológico.
const grupos = new Map();
for (const r of candidatos) {
  const f = r.fields;
  const t = tel9(f["Teléfono"]);
  const e = str(f.Email).toLowerCase();
  if (t.length !== 9 && !e) {
    sinContacto.push(r);
    continue;
  }
  if (t.length === 9 && crm.tels.has(t)) {
    dupTel.push(r);
    continue;
  }
  if (e && crm.emails.has(e)) {
    dupEmail.push(r);
    continue;
  }
  const clave = t.length === 9 ? `t:${t}` : `e:${e}`;
  if (!grupos.has(clave)) grupos.set(clave, []);
  grupos.get(clave).push(r);
}

const unir = (vals) => [...new Set(vals.filter(Boolean))].join("\n\n");
const aCrear = [];
let fusionados = 0;
for (const recsGrupo of grupos.values()) {
  recsGrupo.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  if (recsGrupo.length > 1) fusionados += recsGrupo.length - 1;
  const primero = recsGrupo[0],
    ultimo = recsGrupo[recsGrupo.length - 1];
  const fu = ultimo.fields;
  const campo = (k) => unir(recsGrupo.map((r) => str(r.fields[k])));
  const conversaciones =
    recsGrupo.length > 1
      ? unir(
          recsGrupo.map(
            (r) =>
              str(r.fields.Conversaciones) &&
              `[${r.createdTime.slice(0, 10)}] ${str(r.fields.Conversaciones)}`,
          ),
        )
      : str(fu.Conversaciones);
  const seccion =
    str(fu.Seccion) ||
    recsGrupo
      .map((r) => str(r.fields.Seccion))
      .filter(Boolean)
      .pop() ||
    "";
  aCrear.push({
    nombre:
      recsGrupo
        .map((r) => str(r.fields.Nombre))
        .filter(Boolean)
        .pop() || "Sin nombre",
    telefono:
      recsGrupo
        .map((r) => str(r.fields["Teléfono"]))
        .filter(Boolean)
        .pop() || "",
    email:
      recsGrupo
        .map((r) => str(r.fields.Email))
        .filter(Boolean)
        .pop() || "",
    motivo: str(fu["Motivo de la llamada"]) || campo("Motivo de la llamada"),
    solicitud: campo("Solicitud de llamada"),
    conversaciones,
    observaciones: campo("Observaciones"),
    feedback: campo("Feedback Comercial"),
    seccion,
    // Pendiente si CUALQUIER registro del grupo sigue sin gestionar (la
    // última vez que escribió puede no haberse atendido todavía).
    trabajado: recsGrupo.every((r) => str(r.fields.Trabajado) === "Listo") ? "Contactado" : null,
    tipo_interes: SECCION_A_INTERES[seccion.toLowerCase()] ?? null,
    ciclo_vida: "Lead",
    canal_origen: "Legado",
    airtable_id: ultimo.id,
    // Alta = primera vez que entró. createdTime y no el campo manual "Fecha",
    // que trae valores imposibles (p. ej. fechas futuras).
    created_at: primero.createdTime,
    _seccionPendiente: MAPEO_PENDIENTE.has(seccion.toLowerCase()),
  });
}

const corte30 = new Date(Date.now() - 30 * 864e5).toISOString();
console.log(`Desde ${DESDE}: ${candidatos.length} registros de Airtable no están en el CRM`);
console.log(`  crear:                      ${aCrear.length}`);
console.log(`  omitir, teléfono ya en CRM: ${dupTel.length}`);
console.log(`  omitir, email ya en CRM:    ${dupEmail.length}`);
console.log(`  registros fusionados (misma persona escribió varias veces): ${fusionados}`);
console.log(`  omitir, sin teléfono/email: ${sinContacto.length}`);
console.log("  por mes:", tally(aCrear.map((c) => c.created_at.slice(0, 7))).sort());
console.log("  trabajado:", tally(aCrear.map((c) => c.trabajado ?? "(pendiente)")));
console.log(
  "  tipo_interes:",
  tally(
    aCrear.map(
      (c) =>
        c.tipo_interes ??
        (c._seccionPendiente ? "(Inversión/Rústica: a decidir)" : "(sin sección)"),
    ),
  ),
);
console.log("  con conversación:", aCrear.filter((c) => c.conversaciones).length);
console.log(
  "  caerían en Bandeja → Pendientes (sin gestionar, <30 días):",
  aCrear.filter((c) => !c.trabajado && c.created_at >= corte30).length,
);

if (!APPLY) {
  console.log("\nSIMULACIÓN: no se ha escrito nada. Añade --apply para importar.");
} else {
  const filas = aCrear.map(({ _seccionPendiente, ...c }) => c);
  let ok = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const { error, count } = await supa.from("contacts").upsert(filas.slice(i, i + 200), {
      onConflict: "airtable_id",
      ignoreDuplicates: true,
      count: "exact",
    });
    if (error) throw new Error(`lote ${i / 200 + 1}: ${error.message}`);
    ok += count ?? 0;
  }
  console.log(`\nIMPORTADOS: ${ok}`);
}
