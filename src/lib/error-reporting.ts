type ErrorContext = Record<string, unknown>;

// Structured error reporter — no external calls, no secrets logged.
// Interface is ready to wire a provider (e.g. Sentry) in a future iteration.
export function reportError(error: unknown, context: ErrorContext = {}): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error);
  console.error("[error-reporting]", {
    message,
    route: window.location.pathname,
    ...context,
  });
}
