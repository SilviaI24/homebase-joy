import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Building2, LayoutDashboard, Users, CalendarDays, UserCog, KeyRound, Sparkles, Inbox } from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Cartera",
    items: [
      { to: "/inmuebles", label: "Ventas", icon: Building2 },
      { to: "/alquileres", label: "Alquiler", icon: KeyRound },
      { to: "/clientes", label: "Clientes", icon: Users },
    ],
  },
  {
    label: "Gestión",
    items: [
      { to: "/mis-leads", label: "Mis operaciones", icon: Inbox },
      { to: "/comerciales", label: "Comerciales", icon: UserCog },
      { to: "/visitas", label: "Visitas", icon: CalendarDays },
    ],
  },
  {
    label: "IA",
    items: [
      { to: "/silvia", label: "SilvIA", icon: Sparkles },
    ],
  },
];

const mobileNav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inmuebles", label: "Ventas", icon: Building2 },
  { to: "/alquileres", label: "Alquiler", icon: KeyRound },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/mis-leads", label: "Leads", icon: Inbox },
];

const LINK_CLS = "group flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all [&.active]:bg-gradient-to-r [&.active]:from-gold/95 [&.active]:to-gold/75 [&.active]:text-gold-foreground [&.active]:font-medium [&.active]:shadow-[0_2px_8px_-2px] [&.active]:shadow-gold/40";

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-gradient-to-br from-gold to-amber-200 flex items-center justify-center text-sidebar font-display font-bold text-sm shadow-sm">
              ES
            </div>
            <div>
              <div className="font-display font-semibold tracking-tight text-[13px] text-gold leading-tight">El Sol Grupo</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/50">CRM Inmobiliario</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto space-y-4 pt-3">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/40 font-medium">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to as "/"}
                      activeOptions={{ exact: item.to === "/" }}
                      className={LINK_CLS}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/30 border-t border-sidebar-border">
          v0.3 · Airtable
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-6 shadow-sm">
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate hidden sm:block">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
        {/* Extra bottom padding on mobile to clear the nav bar */}
        <div className="flex-1 p-4 md:p-6 overflow-auto pb-[calc(1rem+3.5rem)] md:pb-6">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border flex items-stretch h-14">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to as "/"}
              activeOptions={{ exact: item.to === "/" }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground [&.active]:text-primary transition-colors py-1"
            >
              <Icon className="size-5" />
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
