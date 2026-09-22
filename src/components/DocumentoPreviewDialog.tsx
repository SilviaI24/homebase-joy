// Vista previa de solo lectura para un documento de la tabla `documentos`
// (onboarding del Portal + contrato firmado) — 22 sep 2026. Pedido por David:
// antes de aprobar documentación o activar el acceso completo al Portal, el
// comercial necesita poder VER el documento (p. ej. una foto de la nota
// simple), no solo ver su nombre en una lista.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDocumentoOnboardingUrl } from "@/lib/inmuebles.functions";

export function DocumentoPreviewDialog({
  documentoId,
  onOpenChange,
}: {
  documentoId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const getUrlFn = useServerFn(getDocumentoOnboardingUrl);
  const [state, setState] = useState<{
    loading: boolean;
    url: string | null;
    tipoMime: string | null;
    nombre: string;
    error: string | null;
  }>({ loading: false, url: null, tipoMime: null, nombre: "", error: null });

  useEffect(() => {
    if (!documentoId) return;
    setState({ loading: true, url: null, tipoMime: null, nombre: "", error: null });
    getUrlFn({ data: { documentoId } })
      .then((res) =>
        setState({
          loading: false,
          url: res.url,
          tipoMime: res.tipoMime,
          nombre: res.nombre,
          error: null,
        }),
      )
      .catch((e: Error) =>
        setState({
          loading: false,
          url: null,
          tipoMime: null,
          nombre: "",
          error: e.message || "No se pudo cargar el documento",
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentoId]);

  const esImagen = state.tipoMime?.startsWith("image/");
  const esPdf = state.tipoMime === "application/pdf";

  return (
    <Dialog open={documentoId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.nombre || "Documento"}</DialogTitle>
        </DialogHeader>

        <div className="min-h-[420px] flex items-center justify-center bg-muted rounded-md overflow-hidden">
          {state.loading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          {state.error && <p className="text-sm text-destructive p-4 text-center">{state.error}</p>}
          {!state.loading && !state.error && state.url && esImagen && (
            <img
              src={state.url}
              alt={state.nombre}
              className="max-w-full max-h-[75vh] object-contain"
            />
          )}
          {!state.loading && !state.error && state.url && esPdf && (
            <iframe title={state.nombre} src={state.url} className="w-full h-[75vh] border-0" />
          )}
          {!state.loading && !state.error && state.url && !esImagen && !esPdf && (
            <div className="p-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                No se puede previsualizar este tipo de archivo.
              </p>
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Abrir en una pestaña nueva
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
