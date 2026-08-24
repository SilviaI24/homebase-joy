// M-03: extraído de src/routes/inmuebles.$id.tsx.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Plus, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { getPropertyDocumentUrl, type Documento } from "@/lib/inmuebles.functions";
import { SkeletonLine } from "./SkeletonLine";

const DOC_TYPES = ["PDF", "Contrato", "Foto", "Plano", "Otro"];

function docIcon(_type: string) {
  return <FileText className="size-4 shrink-0 text-muted-foreground" />;
}

function extractFilename(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const last = parts[parts.length - 1];
    return decodeURIComponent(last || "documento");
  } catch {
    return "documento";
  }
}

export function DocumentosPanel({
  documentos,
  onChange,
  detailReady,
}: {
  documentos: Documento[];
  onChange: (docs: Documento[]) => void;
  detailReady: boolean;
}) {
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("PDF");
  const [adding, setAdding] = useState(false);
  const [openingIdx, setOpeningIdx] = useState<number | null>(null);
  const resolveDocUrl = useServerFn(getPropertyDocumentUrl);

  async function handleOpen(idx: number, value: string) {
    setOpeningIdx(idx);
    try {
      const { url } = await resolveDocUrl({ data: { value } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // property-docs es privado; si falla la firma del enlace, no hay URL directa que abrir.
    } finally {
      setOpeningIdx(null);
    }
  }

  function handleAdd() {
    if (!newUrl.trim()) return;
    const doc: Documento = {
      url: newUrl.trim(),
      filename: newName.trim() || extractFilename(newUrl.trim()),
      type: newType,
    };
    onChange([...documentos, doc]);
    setNewUrl("");
    setNewName("");
    setNewType("PDF");
    setAdding(false);
  }

  function handleRemove(idx: number) {
    onChange(documentos.filter((_, i) => i !== idx));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold">Documentos</h3>
        {detailReady && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-2 py-1 transition-colors"
          >
            <Plus className="size-3" /> Añadir
          </button>
        )}
      </div>

      {!detailReady ? (
        <div className="space-y-2">
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="w-1/2" />
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground/60">Sin documentos adjuntos.</p>
          )}
          {documentos.map((doc, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {docIcon(doc.type)}
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{doc.filename}</span>
                <span className="text-[10px] text-muted-foreground">{doc.type}</span>
              </div>
              <button
                type="button"
                onClick={() => handleOpen(idx, doc.url)}
                disabled={openingIdx === idx}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0 disabled:opacity-50"
              >
                {openingIdx === idx ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ExternalLink className="size-3" />
                )}{" "}
                Abrir
              </button>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="ml-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Eliminar"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          {adding && (
            <div className="rounded-md border border-primary/30 bg-primary/[0.03] p-3 space-y-2">
              <input
                type="url"
                placeholder="URL del documento…"
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value);
                  if (!newName) setNewName(extractFilename(e.target.value));
                }}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nombre (opcional)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 h-8 px-2 rounded border border-input bg-background text-sm"
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="h-8 px-2 rounded border border-input bg-background text-sm"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newUrl.trim()}
                  className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  Añadir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setNewUrl("");
                    setNewName("");
                  }}
                  className="h-8 px-3 rounded border border-input bg-background text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
