import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requireCrmUser } from "@/lib/crm-auth.server";

export type GoogleCalendarStatus = {
  connected: boolean;
  email: string | null;
};

export const getGoogleCalendarStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<GoogleCalendarStatus> => {
    const crm = await requireCrmUser();
    if (!crm.agentId) return { connected: false, email: null };

    const supa = getSupa();
    const { data } = await supa
      .from("agent_google_tokens")
      .select("google_email")
      .eq("agent_id", crm.agentId)
      .maybeSingle();

    return { connected: !!data, email: data?.google_email ?? null };
  },
);

export const disconnectGoogleCalendar = createServerFn({ method: "POST" }).handler(async () => {
  const crm = await requireCrmUser();
  if (!crm.agentId) throw new Error("Tu usuario no tiene un agente asociado");

  const supa = getSupa();
  const { error } = await supa.from("agent_google_tokens").delete().eq("agent_id", crm.agentId);
  if (error) throw new Error(error.message);
  return { ok: true };
});
