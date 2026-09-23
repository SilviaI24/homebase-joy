// Documentos de onboarding del Portal (tabla `documentos`) mostrados en la
// pestaña "Documentos" de la ficha del inmueble — 22 sep 2026. Antes solo se
// veían desde el Portal o desde la ficha de cliente; el contrato firmado y el
// resto de documentación subida (DNI, escritura, IBI, acta de comunidad...)
// nunca aparecía aquí. Solo lectura: aprobar/rechazar sigue viviendo en la
// ficha de cliente (RevisionPropietarioPanel), donde ya está ligado al resto
// del flujo de activación.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, FileCheck, FolderOpen, UserCheck } from "lucide-react";
import { listDocumentosOnboarding } from "@/lib/inmuebles.functions";
import { DocumentoPreviewDialog } from "@/components/DocumentoPreviewDialog";

const ESTADO_LABEL: Record<string, { label: string; className: string }> = {
  aprobado: { label: "Aprobado", className: "text-success" },
  rechazado: { label: "Rechazado", className: "text-destructive" },
  pendiente: { label: "Pendiente", className: "text-muted-foreground" },
  revision: { label: "En revisión", className: "text-muted-foreground" },
  firmado: { label: "Firmado", className: "text-success" },
};

// Mismo `categoria` que la tabla `documentos` del Portal — replica el
// icono/color de `categoriaConfig` en Documentos.tsx (elsol-client-hub) para
// que un documento se vea igual en las dos apps (23 sep 2026, antes siempre
// el mismo FileText gris aquí sin usar la categoría ya disponible).
const CATEGORIA_STYLE: Record<string, { icon: typeof FileText; color: string }> = {
  contrato: { icon: FileCheck, color: "text-success bg-success/10" },
  escritura: { icon: FolderOpen, color: "text-info bg-info/10" },
  nota_encargo: { icon: FileCheck, color: "text-success bg-success/10" },
  dni: { icon: UserCheck, color: "text-violet-600 bg-violet-50 dark:bg-violet-900/20" },
  certificado: { icon: FileCheck, color: "text-warning bg-warning/10" },
  informe_mercado: { icon: FileText, color: "text-info bg-info/10" },
  nota_simple: { icon: FileText, color: "text-violet-600 bg-violet-50 dark:bg-violet-900/20" },
  oferta_recibida: { icon: FileCheck, color: "text-success bg-success/10" },
  certificado_energetico: { icon: FileCheck, color: "text-warning bg-warning/10" },
  contrato_arras: { icon: FileCheck, color: "text-success bg-success/10" },
  otro: { icon: FileText, color: "text-muted-foreground bg-muted" },
};

export function DocumentosOnboardingPanel({ propertyId }: { propertyId: string }) {
  const listFn = useServerFn(listDocumentosOnboarding);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["documentos-onboarding", propertyId],
    queryFn: () => listFn({ data: { propertyId } }),
  });

  const documentos = data?.documentos ?? [];
  if (!isLoading && documentos.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Documentos del Portal (onboarding)</h3>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground px-4 py-3">Cargando…</p>}
      <div className="divide-y divide-border">
        {documentos.map((doc) => {
          const estado = ESTADO_LABEL[doc.estado] ?? ESTADO_LABEL.pendiente;
          const { icon: CatIcon, color: catColor } =
            CATEGORIA_STYLE[doc.categoria ?? "otro"] ?? CATEGORIA_STYLE.otro;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => setPreviewDocId(doc.id)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-flex items-center justify-center size-6 rounded-md shrink-0 ${catColor}`}
                >
                  <CatIcon className="size-3.5" />
                </span>
                <span className="truncate">{doc.nombre}</span>
              </span>
              <span className={`text-xs shrink-0 ${estado.className}`}>{estado.label}</span>
            </button>
          );
        })}
      </div>

      <DocumentoPreviewDialog
        documentoId={previewDocId}
        onOpenChange={(open) => !open && setPreviewDocId(null)}
      />
    </div>
  );
}
