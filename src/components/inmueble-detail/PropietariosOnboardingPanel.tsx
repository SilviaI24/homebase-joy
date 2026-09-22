// Progreso de onboarding por propietario en la ficha del inmueble — 22 sep
// 2026. Reutiliza tal cual RevisionPropietarioPanel (ya construido en la
// ficha de cliente) para cada propietario vinculado, en vez de duplicar la
// lógica de negocio (documentación obligatoria, aprobar/rechazar, activar).
import { RevisionPropietarioPanel } from "@/components/contactos/ClientesPanel";
import type { PropietarioInmueble } from "@/lib/inmuebles.functions";

export function PropietariosOnboardingPanel({
  propietarios,
}: {
  propietarios: PropietarioInmueble[];
}) {
  const conContacto = propietarios.filter((p) => p.contactId);
  if (conContacto.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      <h3 className="font-display text-base font-semibold">Onboarding del propietario</h3>
      {conContacto.map((p) => (
        <div key={p.id} className="space-y-2">
          {conContacto.length > 1 && (
            <div className="text-sm font-medium text-muted-foreground">{p.nombre}</div>
          )}
          <RevisionPropietarioPanel contactId={p.contactId as string} />
        </div>
      ))}
    </div>
  );
}
