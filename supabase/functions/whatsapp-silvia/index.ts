import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  HERRAMIENTAS_SILVIA,
  aFormatoWhatsApp,
  REGLAS_CRM,
  contextoContacto,
  esPeticionDeBaja,
  extraerMensajes,
  firmaMetaValida,
  lineaTranscripcion,
  llamadasAHerramientas,
  sigueAbierta,
  textoDeRespuesta,
  type MensajeEntrante,
} from "./logic.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const PROMPT_ID =
  env("SILVIA_PROMPT_ID") || "pmpt_69b7d28a56f08190ba6e49b524deed260cfc985bb36cff5d";
// "activo" envía por WhatsApp; cualquier otro valor genera y guarda la
// respuesta sin enviarla (por defecto: nada sale hasta activarlo a propósito).
const MODO_ACTIVO = env("WHATSAPP_SILVIA_MODO") === "activo";
const MAX_VUELTAS_HERRAMIENTAS = 4;

const TEXTO_BAJA =
  "Hecho: no volverás a recibir mensajes nuestros por WhatsApp. Si en algún momento quieres retomar el contacto, escríbenos cuando quieras.";
const TEXTO_NO_TEXTO =
  "Ahora mismo solo puedo leer mensajes de texto. ¿Me lo puedes escribir, por favor?";

type Contacto = {
  id: string;
  nombre: string | null;
  email: string | null;
  tipo_interes: string | null;
  whatsapp_baja: boolean;
  silvia_pausada_hasta: string | null;
  conversaciones: string | null;
};

type Conversacion = {
  id: string;
  ai_thread_id: string | null;
  transcripcion: string | null;
  metadata: Record<string, unknown> | null;
};

async function resolverContacto(supa: SupabaseClient, m: MensajeEntrante): Promise<Contacto> {
  const campos =
    "id, nombre, email, tipo_interes, whatsapp_baja, silvia_pausada_hasta, conversaciones";
  const { data: id } = await supa.rpc("crm_contacto_por_telefono", { p_telefono: m.telefono });
  if (id) {
    const { data } = await supa.from("contacts").select(campos).eq("id", id).single();
    if (data) return data as Contacto;
  }
  const { data, error } = await supa
    .from("contacts")
    .insert({
      nombre: m.nombrePerfil || "Sin nombre",
      telefono: `+${m.telefono}`,
      ciclo_vida: "Lead",
      canal_origen: "WhatsApp",
    })
    .select(campos)
    .single();
  if (error) throw new Error(`alta de contacto: ${error.message}`);
  return data as Contacto;
}

async function conversacionAbierta(
  supa: SupabaseClient,
  contacto: Contacto,
  m: MensajeEntrante,
): Promise<Conversacion> {
  const { data: ultima } = await supa
    .from("conversaciones")
    .select("id, ai_thread_id, transcripcion, metadata")
    .eq("contact_id", contacto.id)
    .eq("canal", "WhatsApp")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultimoMensaje = (ultima?.metadata as { ultimo_mensaje_at?: string } | null)
    ?.ultimo_mensaje_at;
  if (ultima && sigueAbierta(ultimoMensaje, m.timestamp)) return ultima as Conversacion;

  const { data, error } = await supa
    .from("conversaciones")
    .insert({
      contact_id: contacto.id,
      canal: "WhatsApp",
      telefono: `+${m.telefono}`,
      nombre: contacto.nombre,
      fecha: m.timestamp.toISOString(),
      estado: "pendiente",
      metadata: { origen: "whatsapp-silvia", ultimo_mensaje_at: m.timestamp.toISOString() },
    })
    .select("id, ai_thread_id, transcripcion, metadata")
    .single();
  if (error) throw new Error(`alta de conversación: ${error.message}`);
  return data as Conversacion;
}

async function anotar(
  supa: SupabaseClient,
  conv: Conversacion,
  linea: string,
  cambios: Record<string, unknown> = {},
) {
  conv.transcripcion = [conv.transcripcion, linea].filter(Boolean).join("\n");
  conv.metadata = { ...(conv.metadata ?? {}), ultimo_mensaje_at: new Date().toISOString() };
  await supa
    .from("conversaciones")
    .update({ transcripcion: conv.transcripcion, metadata: conv.metadata, ...cambios })
    .eq("id", conv.id);
}

async function enviarWhatsApp(
  telefono: string,
  texto: string,
): Promise<{ wamid: string | null; estado: string }> {
  if (!MODO_ACTIVO) return { wamid: null, estado: "simulado" };
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${env("WABA_PHONE_NUMBER_ID")}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("WABA_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefono,
        type: "text",
        text: { preview_url: true, body: texto },
      }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!res.ok) return { wamid: null, estado: `error: ${body.error?.message ?? res.status}` };
  return { wamid: body.messages?.[0]?.id ?? null, estado: "enviado" };
}

async function responderYGuardar(
  supa: SupabaseClient,
  contacto: Contacto,
  conv: Conversacion,
  m: MensajeEntrante,
  texto: string,
) {
  const envio = await enviarWhatsApp(m.telefono, texto);
  await supa.from("whatsapp_mensajes").insert({
    wamid: envio.wamid,
    contact_id: contacto.id,
    conversacion_id: conv.id,
    direccion: "saliente",
    autor: "silvia",
    texto,
    estado_envio: envio.estado,
  });
  await anotar(supa, conv, lineaTranscripcion("SilvIA", texto, new Date()));
}

async function ejecutarHerramienta(
  supa: SupabaseClient,
  contacto: Contacto,
  conv: Conversacion,
  nombre: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (nombre === "buscar_inmueble") {
    const operacion =
      args.operacion === "venta" || args.operacion === "alquiler" ? args.operacion : null;
    const { data, error } = await supa.rpc("silvia_buscar_inmuebles", {
      p_texto: String(args.texto ?? ""),
      p_operacion: operacion,
      p_limite: 5,
    });
    if (error) return { error: "No se pudo buscar ahora mismo" };
    return {
      resultados: data ?? [],
      nota: (data ?? []).length ? undefined : "No encontrado en la cartera disponible",
    };
  }
  if (nombre === "registrar_datos_lead") {
    const patch: Record<string, unknown> = {};
    const nombreCliente = typeof args.nombre === "string" ? args.nombre.trim() : "";
    if (nombreCliente && (!contacto.nombre || contacto.nombre === "Sin nombre"))
      patch.nombre = nombreCliente;
    if (typeof args.interes === "string" && !contacto.tipo_interes)
      patch.tipo_interes = args.interes;
    const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
    if (email.includes("@") && !contacto.email?.trim()) patch.email = email;
    // Datos del antiguo formulario de alquiler: lo último que diga el cliente
    // manda (puede corregirse a sí mismo durante la conversación).
    for (const campo of ["contrato_trabajo", "profesion", "mascota", "avalista"] as const) {
      const v = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
      if (v) patch[campo] = v;
    }
    const ref = typeof args.inmueble_ref === "string" ? args.inmueble_ref.trim() : "";
    if (ref) patch.solicitud = `Inmueble de interés (WhatsApp): ${ref}`;
    if (Object.keys(patch).length) await supa.from("contacts").update(patch).eq("id", contacto.id);
    const cambiosConv: Record<string, unknown> = {};
    if (typeof args.pide_llamada === "boolean") cambiosConv.pide_llamada = args.pide_llamada;
    if (typeof args.resumen === "string" && args.resumen.trim())
      cambiosConv.resumen = args.resumen.trim();
    if (Object.keys(cambiosConv).length)
      await supa.from("conversaciones").update(cambiosConv).eq("id", conv.id);
    return { ok: true };
  }
  return { error: `Herramienta desconocida: ${nombre}` };
}

async function generarRespuesta(
  supa: SupabaseClient,
  contacto: Contacto,
  conv: Conversacion,
  texto: string,
): Promise<string> {
  const entrada: unknown[] = [];
  if (!conv.ai_thread_id) {
    // Mismo contexto que le pasaba el escenario de Make: quién es y qué se
    // habló antes, para no volver a preguntar lo que ya se sabe.
    entrada.push({ role: "developer", content: contextoContacto(contacto) });
  }
  entrada.push({ role: "developer", content: REGLAS_CRM });
  entrada.push({ role: "user", content: texto });

  let previa = conv.ai_thread_id;
  let input: unknown[] = entrada;
  for (let vuelta = 0; vuelta < MAX_VUELTAS_HERRAMIENTAS; vuelta++) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("OPENAI_API_KEY_SILVIA")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: { id: PROMPT_ID },
        input,
        tools: HERRAMIENTAS_SILVIA,
        ...(previa ? { previous_response_id: previa } : {}),
        store: true,
      }),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${r?.error?.message ?? "sin detalle"}`);
    previa = r.id;
    const llamadas = llamadasAHerramientas(r);
    if (!llamadas.length) {
      await supa.from("conversaciones").update({ ai_thread_id: previa }).eq("id", conv.id);
      conv.ai_thread_id = previa;
      return textoDeRespuesta(r);
    }
    input = [];
    for (const ll of llamadas) {
      const salida = await ejecutarHerramienta(supa, contacto, conv, ll.nombre, ll.args);
      input.push({
        type: "function_call_output",
        call_id: ll.callId,
        output: JSON.stringify(salida),
      });
    }
  }
  throw new Error("Demasiadas llamadas a herramientas sin respuesta final");
}

async function procesar(supa: SupabaseClient, m: MensajeEntrante) {
  // El wamid es único: si Meta reintenta el mismo mensaje, el insert no
  // devuelve fila y no se procesa dos veces.
  const { data: nuevo, error: dupErr } = await supa
    .from("whatsapp_mensajes")
    .upsert(
      {
        wamid: m.wamid,
        direccion: "entrante",
        autor: "cliente",
        tipo: m.tipo,
        texto: m.texto,
        created_at: m.timestamp.toISOString(),
      },
      { onConflict: "wamid", ignoreDuplicates: true },
    )
    .select("id");
  if (dupErr) throw new Error(`registro de mensaje: ${dupErr.message}`);
  if (!nuevo?.length) return;
  const mensajeId = nuevo[0].id;

  const contacto = await resolverContacto(supa, m);
  const conv = await conversacionAbierta(supa, contacto, m);
  await supa
    .from("whatsapp_mensajes")
    .update({ contact_id: contacto.id, conversacion_id: conv.id })
    .eq("id", mensajeId);
  await anotar(supa, conv, lineaTranscripcion("Cliente", m.texto ?? `(${m.tipo})`, m.timestamp));
  await supa
    .from("contacts")
    .update({ ultimo_contacto_at: m.timestamp.toISOString() })
    .eq("id", contacto.id);

  if (contacto.whatsapp_baja) return;
  if (esPeticionDeBaja(m.texto)) {
    await supa.from("contacts").update({ whatsapp_baja: true }).eq("id", contacto.id);
    await responderYGuardar(supa, contacto, conv, m, TEXTO_BAJA);
    return;
  }
  if (contacto.silvia_pausada_hasta && new Date(contacto.silvia_pausada_hasta) > new Date()) return;
  if (!m.texto) {
    await responderYGuardar(supa, contacto, conv, m, TEXTO_NO_TEXTO);
    return;
  }
  const respuesta = aFormatoWhatsApp(await generarRespuesta(supa, contacto, conv, m.texto));
  if (respuesta) await responderYGuardar(supa, contacto, conv, m, respuesta);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Verificación del webhook al configurarlo en Meta.
  if (req.method === "GET") {
    const ok =
      url.searchParams.get("hub.mode") === "subscribe" &&
      env("WHATSAPP_VERIFY_TOKEN") !== "" &&
      url.searchParams.get("hub.verify_token") === env("WHATSAPP_VERIFY_TOKEN");
    return ok
      ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
      : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const cuerpo = await req.text();
  // Sin App Secret configurado no se acepta nada (falla cerrada).
  if (
    !(await firmaMetaValida(
      cuerpo,
      req.headers.get("x-hub-signature-256"),
      env("WHATSAPP_APP_SECRET"),
    ))
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const miNumero = env("WABA_PHONE_NUMBER_ID");
  const mensajes = extraerMensajes(payload).filter(
    (m) => !miNumero || !m.phoneNumberId || m.phoneNumberId === miNumero,
  );

  const supa = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  // Meta exige respuesta rápida o reintenta: se contesta ya y se procesa detrás.
  const trabajo = (async () => {
    for (const m of mensajes) {
      try {
        await procesar(supa, m);
      } catch (e) {
        console.error("whatsapp-silvia", m.wamid, e instanceof Error ? e.message : e);
      }
    }
  })();
  EdgeRuntime.waitUntil(trabajo);
  return new Response("ok", { status: 200 });
});
