// Empuje único CRM -> Google Calendar, conexión por agente (OAuth). Ver
// migración 20260915150000_google_calendar_por_agente.sql.
//
// Toda función que habla con la API de Google es "best effort": si Google
// falla (agente no conectado, token revocado, la API caída), nunca lanza --
// solo devuelve null/false y registra el error. La creación/edición/borrado
// de una visita en el CRM no debe depender de que Google Calendar responda.
import { getSupa } from "./supabase.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
// calendar.events (crear/editar/borrar eventos, no acceso al resto del
// calendario) + openid/email solo para mostrar "conectado como
// fulano@empresa.com" en el perfil sin una llamada aparte a userinfo.
const SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} no configurado`);
  return v;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Fuerza que Google devuelva refresh_token también en reconexiones
    // (por defecto solo lo manda la primera vez que el usuario autoriza).
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function decodeIdTokenEmail(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
    };
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

export type TokensExchange = {
  refreshToken: string;
  accessToken: string;
  expiresAt: string;
  email: string | null;
};

export async function exchangeCodeForTokens(code: string): Promise<TokensExchange> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof data.refresh_token !== "string") {
    throw new Error(
      (data.error_description as string) ||
        (data.error as string) ||
        "No se pudo conectar con Google Calendar",
    );
  }
  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token as string,
    expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000).toISOString(),
    email: decodeIdTokenEmail(data.id_token),
  };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string } | null> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// Access token válido para este agente, o null si no tiene Google Calendar
// conectado (o el refresh_token ya no es válido -- p. ej. revocó el acceso
// desde su cuenta de Google). En ese caso se borra la conexión para que el
// perfil muestre "Desconectado" en vez de fallar en silencio indefinidamente.
async function getValidAccessToken(agentId: string): Promise<string | null> {
  const supa = getSupa();
  const { data: row } = await supa
    .from("agent_google_tokens")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!row) return null;

  const marginMs = 60_000;
  if (
    row.access_token &&
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() - marginMs > Date.now()
  ) {
    return row.access_token;
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed) {
    await supa.from("agent_google_tokens").delete().eq("agent_id", agentId);
    return null;
  }
  await supa
    .from("agent_google_tokens")
    .update({
      access_token: refreshed.accessToken,
      access_token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", agentId);
  return refreshed.accessToken;
}

export async function guardarConexionGoogle(agentId: string, tokens: TokensExchange) {
  const supa = getSupa();
  const { error } = await supa.from("agent_google_tokens").upsert(
    {
      agent_id: agentId,
      refresh_token: tokens.refreshToken,
      access_token: tokens.accessToken,
      access_token_expires_at: tokens.expiresAt,
      google_email: tokens.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id" },
  );
  if (error) throw new Error(error.message);
}

export type VisitaEventInput = {
  titulo: string;
  descripcion?: string;
  ubicacion?: string;
  inicioISO: string;
  finISO: string;
};

function eventBody(input: VisitaEventInput) {
  return {
    summary: input.titulo,
    description: input.descripcion || undefined,
    location: input.ubicacion || undefined,
    start: { dateTime: input.inicioISO },
    end: { dateTime: input.finISO },
  };
}

export async function crearEventoGoogle(
  agentId: string,
  input: VisitaEventInput,
): Promise<string | null> {
  const token = await getValidAccessToken(agentId);
  if (!token) return null;
  try {
    const res = await fetch(GOOGLE_EVENTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(input)),
    });
    if (!res.ok) {
      console.error("crearEventoGoogle:", await res.text());
      return null;
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch (e) {
    console.error("crearEventoGoogle:", e);
    return null;
  }
}

export async function actualizarEventoGoogle(
  agentId: string,
  eventId: string,
  input: VisitaEventInput,
): Promise<boolean> {
  const token = await getValidAccessToken(agentId);
  if (!token) return false;
  try {
    const res = await fetch(`${GOOGLE_EVENTS_URL}/${eventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(input)),
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error("actualizarEventoGoogle:", await res.text());
    }
    return res.ok;
  } catch (e) {
    console.error("actualizarEventoGoogle:", e);
    return false;
  }
}

export async function eliminarEventoGoogle(agentId: string, eventId: string): Promise<void> {
  const token = await getValidAccessToken(agentId);
  if (!token) return;
  try {
    const res = await fetch(`${GOOGLE_EVENTS_URL}/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410 && res.status !== 204) {
      console.error("eliminarEventoGoogle:", await res.text());
    }
  } catch (e) {
    console.error("eliminarEventoGoogle:", e);
  }
}
