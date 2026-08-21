/**
 * Cabeceras de seguridad HTTP — hallazgo M-07 de la auditoría
 * (AUDITORIA_INTEGRAL_CRM_HOMEBASE_JOY_2026-08-14.md).
 *
 * ¿Por qué aquí y no solo en `vercel.json`?
 * El build usa el preset `vercel` de Nitro, que escribe su propio
 * `.vercel/output/config.json` (Build Output API). Ese fichero solo contiene
 * las rutas de Nitro: no arrastra el bloque `headers` de `vercel.json`, así que
 * no se puede dar por hecho que la plataforma lo aplique a las respuestas que
 * sirve la función SSR. Aplicarlas en el entry del servidor las garantiza en
 * cualquier destino (Vercel, Cloudflare, `vite preview`) y las hace testeables
 * sin desplegar.
 *
 * `vercel.json` mantiene el mismo juego de cabeceras a propósito: cubre las
 * respuestas de `/assets/*`, que Vercel sirve desde su CDN (`handle: filesystem`)
 * y nunca pasan por `src/server.ts`. Los valores son idénticos, así que si las
 * dos capas se aplican el resultado no cambia.
 */

/** Origen de Supabase por defecto (proyecto de producción, ver CLAUDE.md). */
const SUPABASE_FALLBACK_ORIGIN = "https://fyrfkbcabmitbfuqeccq.supabase.co";

export type SecurityHeaderEnv = {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  NODE_ENV?: string;
};

/**
 * Origen (esquema + host) del proyecto Supabase al que apunta este despliegue.
 * Se deriva del entorno para que QA/local no queden clavados al proyecto de
 * producción; si ninguna variable es una URL válida, cae al de producción.
 */
export function resolveSupabaseOrigin(env: SecurityHeaderEnv): string {
  for (const candidate of [env.SUPABASE_URL, env.VITE_SUPABASE_URL]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // URL malformada: la ignoramos y probamos la siguiente.
    }
  }
  return SUPABASE_FALLBACK_ORIGIN;
}

/**
 * CSP que SÍ se aplica (enforce). Solo directivas que no pueden romper la app
 * porque no dependen de qué scripts/estilos cargue: el CRM no se embebe en
 * ningún iframe, no usa `<object>`/`<embed>`, no manipula `<base>` y no envía
 * formularios nativos a terceros (verificado en el código).
 *
 * `frame-ancestors 'none'` es la directiva antiframing que pedía la auditoría;
 * `X-Frame-Options: DENY` la duplica para navegadores antiguos.
 */
export function buildEnforcedCsp(): string {
  return [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * CSP completa, de momento en `Content-Security-Policy-Report-Only`.
 *
 * Va en report-only a propósito: TanStack Start inyecta scripts inline para la
 * hidratación SSR y el arranque de tema vive en un `<script>` inline en
 * `__root.tsx`, así que la política necesita `'unsafe-inline'` en `script-src`
 * hasta que se implementen nonces por petición. Fijarla como enforce sin
 * haberla probado en un navegador real contra un despliegue puede dejar la app
 * en blanco. En report-only el navegador reporta la violación en consola y no
 * bloquea nada, lo que permite validarla antes de promoverla.
 *
 * Orígenes permitidos y por qué:
 *  - `https://fonts.googleapis.com` (style-src): hoja de estilos de Google Fonts
 *    cargada en `__root.tsx`.
 *  - `https://fonts.gstatic.com` (font-src): ficheros de tipografía de esa hoja.
 *  - Origen de Supabase (connect-src, https y wss): auth/refresh de sesión desde
 *    el navegador con la anon key; wss queda cubierto para Realtime a futuro.
 *  - `img-src ... https:`: las fotos de inmuebles y los documentos admiten URLs
 *    externas pegadas a mano (Google Drive, Airtable heredado), así que no se
 *    puede cerrar a una lista de hosts sin romper fichas existentes.
 */
export function buildReportOnlyCsp(env: SecurityHeaderEnv): string {
  const supabase = resolveSupabaseOrigin(env);
  const supabaseWs = supabase.replace(/^https:/, "wss:");

  return [
    "default-src 'self'",
    // 'unsafe-inline': scripts de hidratación de TanStack Start + arranque de tema.
    "script-src 'self' 'unsafe-inline'",
    // 'unsafe-inline': estilos inline de Radix/Recharts y atributos style de React.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${supabase} ${supabaseWs}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Cabeceras de seguridad para una respuesta.
 *
 * @param env      Variables de entorno del proceso.
 * @param isSecure `true` si la petición llegó por https. HSTS solo se emite en
 *                 ese caso: los navegadores ignoran HSTS sobre transporte no
 *                 seguro y así no se ensucia el estado HSTS de `localhost`.
 */
export function buildSecurityHeaders(
  env: SecurityHeaderEnv,
  isSecure: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // microphone=(self) es necesario: la búsqueda por voz usa la Web Speech API
    // (SpeechRecognition en AppShell). El resto de capacidades, bloqueadas.
    "Permissions-Policy":
      "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), display-capture=()",
    // Aísla el contexto de navegación. Seguro aquí: el login es email/password,
    // no hay popups de OAuth que necesiten comunicarse con la ventana abridora.
    // COEP se deja fuera a propósito: rompería fuentes e imágenes de terceros.
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": buildEnforcedCsp(),
    "Content-Security-Policy-Report-Only": buildReportOnlyCsp(env),
  };

  if (isSecure) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }

  // En `vite dev` la CSP report-only solo generaría ruido de violaciones
  // propias de Vite (eval de HMR, ws://localhost) que no reflejan producción.
  // Se comprueba contra "development" y no contra != "production" para que un
  // NODE_ENV ausente en el runtime de despliegue no desactive la CSP.
  if (env.NODE_ENV === "development") {
    delete headers["Content-Security-Policy-Report-Only"];
  }

  return headers;
}

/** `true` si la petición llegó por un transporte seguro (https). */
export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]!.trim() === "https";
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Aplica las cabeceras a la respuesta. Sobrescribe cualquier valor previo para
 * que el resultado sea determinista.
 *
 * Si las cabeceras de la respuesta son inmutables (por ejemplo las que crea
 * `Response.redirect()`), se reconstruye la respuesta reutilizando el mismo
 * `ReadableStream`, de modo que el streaming SSR se mantiene intacto.
 */
export function applySecurityHeaders(
  response: Response,
  env: SecurityHeaderEnv,
  isSecure: boolean,
): Response {
  const securityHeaders = buildSecurityHeaders(env, isSecure);

  try {
    for (const [name, value] of Object.entries(securityHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(securityHeaders)) {
      headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
