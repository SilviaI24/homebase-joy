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

export function AppShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-to-br from-gold to-amber-200 flex items-center justify-center text-sidebar font-display font-bold text-sm shadow-sm">
              ES
            </div>
            <div>
              <div className="font-display font-semibold tracking-tight text-base text-gold leading-tight">El Sol Grupo</div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-sidebar-foreground/60">CRM Inmobiliario</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-sidebar-foreground/40 rounded-md cursor-not-allowed"
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
                className="group flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all [&.active]:bg-gradient-to-r [&.active]:from-gold/95 [&.active]:to-gold/75 [&.active]:text-gold-foreground [&.active]:font-medium [&.active]:shadow-[0_2px_8px_-2px] [&.active]:shadow-gold/40"
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 border-t border-sidebar-border">
          v0.2 · Airtable
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6 shadow-sm">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
        <div className="flex-1 p-6 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
