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

// CSRF disabled for QA Vercel preview — origin URL mismatch in serverless env.
// TODO: re-enable with explicit origin before production.
const csrfMiddleware = createCsrfMiddleware({
  filter: () => false,
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
