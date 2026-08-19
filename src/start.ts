import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Allowed origins: explicit comma-separated list + Vercel deployment URLs.
// Any origin not in this set fails CSRF validation (fail-closed).
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const o of (process.env.CSRF_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    origins.add(o);
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) origins.add(`https://${vercelUrl}`);
  const vercelBranchUrl = process.env.VERCEL_BRANCH_URL;
  if (vercelBranchUrl) origins.add(`https://${vercelBranchUrl}`);
  return origins;
}

// CSRF only applies to state-changing requests (POST). GET page navigations
// are never CSRF vectors and Sec-Fetch-Site:'none'/'cross-site' would block
// direct URL access / Vercel dashboard links otherwise.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.request.method === "POST",
  origin: (value) => buildAllowedOrigins().has(value),
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
