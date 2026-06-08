import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Building2, LayoutDashboard, Users, CalendarDays, UserCog, KeyRound, Sparkles } from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
};
const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inmuebles", label: "Inmuebles", icon: Building2 },
  { to: "/alquileres", label: "Alquileres", icon: KeyRound },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/silvia", label: "SilvIA", icon: Sparkles },
  { to: "/comerciales", label: "Comerciales", icon: UserCog },
  { to: "/visitas", label: "Visitas", icon: CalendarDays },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card">
        <div className="px-5 py-5 border-b border-border">
          <div className="font-semibold tracking-tight text-lg text-amber-400">El Sol Grupo</div>
          <div className="text-xs text-muted-foreground">CRM Inmobiliario</div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground/60 rounded-md cursor-not-allowed"
                  title="Próximamente"
                >
                  <Icon className="size-4" />
                  {item.label}
                </div>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to as "/"}
                activeOptions={{ exact: item.to === "/" }}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-foreground/80 hover:bg-accent hover:text-foreground transition-colors [&.active]:bg-primary [&.active]:text-primary-foreground"
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 text-[11px] text-muted-foreground border-t border-border">
          v0.1 · Airtable conectado
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-6">
          <h1 className="text-base font-semibold">{title}</h1>
        </header>
        <div className="flex-1 p-6 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
