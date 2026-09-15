// Arranca el flujo OAuth: /api/google-calendar/connect
import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/start-server-core";
import { requireCrmUser } from "@/lib/crm-auth.server";
import { buildGoogleAuthUrl } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Cualquier usuario CRM con sesión válida puede conectar SU PROPIO
        // calendario -- no requiere un permiso especial, solo tener un
        // agente asociado (si no lo tiene, no hay a qué calendario asociar
        // las visitas).
        const crm = await requireCrmUser();
        if (!crm.agentId) {
          const url = new URL("/perfil", request.url);
          url.searchParams.set("google_calendar", "sin-agente");
          return Response.redirect(url.toString(), 302);
        }

        const state = crypto.randomUUID();
        setCookie("google_oauth_state", state, {
          httpOnly: true,
          secure: process.env.APP_ENV === "production",
          sameSite: "lax",
          maxAge: 600,
          path: "/",
        });

        return Response.redirect(buildGoogleAuthUrl(state), 302);
      },
    },
  },
});
