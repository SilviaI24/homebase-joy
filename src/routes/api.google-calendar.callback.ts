// Vuelta del flujo OAuth: /api/google-calendar/callback
import { createFileRoute } from "@tanstack/react-router";
import { getCookie, deleteCookie } from "@tanstack/start-server-core";
import { requireCrmUser } from "@/lib/crm-auth.server";
import { exchangeCodeForTokens, guardarConexionGoogle } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const redirectTo = (status: string) => {
          const dest = new URL("/perfil", request.url);
          dest.searchParams.set("google_calendar", status);
          return Response.redirect(dest.toString(), 302);
        };

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) return redirectTo("cancelado");
        if (!code || !state) return redirectTo("error");

        const cookieState = getCookie("google_oauth_state");
        deleteCookie("google_oauth_state", { path: "/" });
        if (!cookieState || cookieState !== state) return redirectTo("error");

        const crm = await requireCrmUser();
        if (!crm.agentId) return redirectTo("sin-agente");

        try {
          const tokens = await exchangeCodeForTokens(code);
          await guardarConexionGoogle(crm.agentId, tokens);
        } catch (e) {
          console.error("google-calendar callback:", e);
          return redirectTo("error");
        }

        return redirectTo("ok");
      },
    },
  },
});
