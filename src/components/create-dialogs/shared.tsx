// Primitivos de formulario compartidos entre los 3 diálogos "Nuevo…".
// M-03: extraído de src/components/CreateDialogs.tsx.
import { useState, useId, isValidElement, cloneElement, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  // Ningún <Label> del proyecto usaba htmlFor/id — visualmente pegados al
  // input, pero un lector de pantalla no anunciaba el nombre del campo al
  // enfocarlo (auditoría 12 sep 2026, el hallazgo de accesibilidad de mayor
  // impacto: afecta a los 3 flujos de alta principales). Cuando el hijo es
  // un único control real (Input/Textarea/select), se le inyecta un id
  // generado y el Label apunta a él con htmlFor. Cuando no lo es (p. ej. un
  // grupo de checkboxes envuelto en un div), se deja como etiqueta visual
  // sin asociar — no hay un único control al que apuntar.
  const generatedId = useId();
  const canAssociate = isValidElement(children) && typeof children.props === "object";
  const inputId =
    canAssociate && children.props && typeof (children.props as { id?: string }).id === "string"
      ? (children.props as { id: string }).id
      : generatedId;
  const control = canAssociate ? cloneElement(children, { id: inputId } as object) : children;

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={canAssociate ? inputId : undefined}
        className="text-xs font-medium text-foreground/80"
      >
        {label}
      </Label>
      {control}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MoreSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border pt-3">
      <CollapsibleTrigger className="text-xs font-medium text-primary hover:underline">
        {open ? "Ocultar opcionales" : "Mostrar campos opcionales"}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 sm:grid-cols-2 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function MultiSelect({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="max-h-32 overflow-auto rounded-md border border-input bg-background p-2 space-y-1">
      {options.length === 0 && (
        <div className="text-xs text-muted-foreground py-1">Sin opciones</div>
      )}
      {options.map((o) => {
        const checked = value.includes(o.id);
        return (
          <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))
              }
            />
            <span className="truncate">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function NewButton({
  children = "Nuevo",
  onClick,
}: {
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <DialogTrigger asChild>
      <Button size="sm" className="h-9 gap-1.5" onClick={onClick}>
        <Plus className="size-4" />
        {children}
      </Button>
    </DialogTrigger>
  );
}
