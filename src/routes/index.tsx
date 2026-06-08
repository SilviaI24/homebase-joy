import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Building2, Users, CalendarDays, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · El Sol Grupo CRM" },
      { name: "description", content: "Panel comercial 360 de la inmobiliaria El Sol Grupo." },
    ],
  }),
  component: Dashboard,
});

const cards = [
  { label: "Inmuebles activos", value: "—", icon: Building2 },
  { label: "Clientes", value: "—", icon: Users },
  { label: "Visitas (mes)", value: "—", icon: CalendarDays },
  { label: "Ventas (mes)", value: "—", icon: TrendingUp },
];

function Dashboard() {
  return (
    <AppShell title="Dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{c.label}</div>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{c.value}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 rounded-lg border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
        Bienvenido al CRM. Empieza por <a className="text-primary underline" href="/inmuebles">Inmuebles</a> para ver el listado conectado a Airtable.
      </div>
    </AppShell>
  );
}
