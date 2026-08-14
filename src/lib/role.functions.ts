import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth.server";
import { getSupa } from "@/lib/supabase.server";

export type UserRol = "ADMIN" | "FINANCIERO" | "MANAGER" | "SENIOR" | "AGENTE";

export type MyRole = {
  isAdmin: boolean;
  isFinanciero: boolean;
  agentId: string | null;
  rol: UserRol;
};

export const getMyRole = createServerFn({ method: "GET" }).handler(async (): Promise<MyRole> => {
  const user = await requireAuth();
  const supa = getSupa();

  const { data: agent } = await supa
    .from("agents")
    .select("id, rol")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!agent) {
    return { isAdmin: true, isFinanciero: true, agentId: null, rol: "ADMIN" };
  }

  const rol = ((agent.rol as string) ?? "AGENTE") as UserRol;
  return {
    isAdmin: rol === "ADMIN",
    isFinanciero: rol === "ADMIN" || rol === "FINANCIERO",
    agentId: agent.id,
    rol,
  };
});
