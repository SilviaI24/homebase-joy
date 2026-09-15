// M-03: extraído de src/components/CreateDialogs.tsx.
import { useState, useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2, X, Upload, Link2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createInmueble, type CreateInmueblePayload } from "@/lib/mutations.functions";
import { uploadPropertyAttachment } from "@/lib/inmuebles.functions";
import { agentesQuery, searchClientesPickerQuery } from "@/lib/queries";
import { Field, MoreSection, MultiSelect, NewButton } from "@/components/create-dialogs/shared";
import { NewClienteDialog } from "@/components/create-dialogs/NewClienteDialog";
import {
  TIPOS_VENTA,
  TIPOS_ALQUILER,
  type TipoInmueble,
  ICONOS_TIPO,
  ORIENTACION_OPCIONES,
  type FieldDef,
  getSchemaForTipo,
} from "@/lib/inmueble-schema";

function OrientacionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(
    () =>
      value !== "" &&
      !ORIENTACION_OPCIONES.includes(value as (typeof ORIENTACION_OPCIONES)[number]),
  );
  if (custom) {
    return (
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe orientación…"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-2"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }
  return (
    <select
      value={
        ORIENTACION_OPCIONES.includes(value as (typeof ORIENTACION_OPCIONES)[number]) ? value : ""
      }
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setCustom(true);
          onChange("");
        } else onChange(e.target.value);
      }}
      className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
    >
      <option value="">—</option>
      {ORIENTACION_OPCIONES.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__custom__">+ Personalizado…</option>
    </select>
  );
}

// Combobox of existing clients + inline "+ Añadir cliente"
function PropietarioBlock({
  selected,
  onChange,
  fechaInicio,
  setFechaInicio,
  fechaExclusiva,
  setFechaExclusiva,
  observaciones,
  setObservaciones,
  esAlquiler,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  fechaInicio: string;
  setFechaInicio: (v: string) => void;
  fechaExclusiva: string;
  setFechaExclusiva: (v: string) => void;
  observaciones: string;
  setObservaciones: (v: string) => void;
  // Instrucciones de mejora del CRM (sep 2026), §2.7: en alquiler basta con
  // cliente + fecha de inicio -- la exclusiva de venta no aplica.
  esAlquiler: boolean;
}) {
  const [filter, setFilter] = useState("");
  // Búsqueda server-side con límite — antes cargaba clientesQueryOpts
  // completo (todos los Cliente/Prospecto, con el motor de matching
  // corriendo fila por fila) y filtraba/recortaba a 30 en memoria (auditoría
  // 12 sep 2026).
  const clientes = useQuery(searchClientesPickerQuery({ q: filter, limit: 30 }));
  const list = (clientes.data?.clientes ?? []).map((c) => ({
    id: c.id,
    label: `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}`,
  }));

  return (
    <div className="sm:col-span-2 mt-3 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Propietario</h4>
        <NewClienteDialog
          trigger={
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1">
              <Plus className="size-3.5" /> Añadir cliente
            </Button>
          }
        />
      </div>
      <Field label="Seleccionar propietario" hint={`Seleccionados: ${selected.length}`}>
        <Input
          placeholder="Filtrar por nombre/teléfono…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-2"
        />
        <MultiSelect options={list} value={selected} onChange={onChange} />
        {list.length === 30 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Mostrando los 30 más recientes. Escribe nombre o teléfono para acotar.
          </p>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha de inicio">
          <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </Field>
        {!esAlquiler && (
          <Field label="Fecha de autorización de venta (exclusiva)">
            <Input
              type="date"
              value={fechaExclusiva}
              onChange={(e) => setFechaExclusiva(e.target.value)}
            />
          </Field>
        )}
      </div>
      <Field label="Observaciones sobre el propietario">
        <Textarea
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="P. ej. prefiere que le llamen por la tarde…"
        />
      </Field>
    </div>
  );
}

// ─── File upload helpers ──────────────────────────────────────────────────────

type UploadedFile = {
  clientId: string;
  filename: string;
  url?: string;
  status: "uploading" | "done" | "error" | "link";
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function FileUploadField({
  label,
  bucket,
  accept,
  isImage,
  onUrlsChange,
}: {
  label: string;
  bucket: "property-images" | "property-docs";
  accept: string;
  isImage: boolean;
  onUrlsChange: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadFn = useServerFn(uploadPropertyAttachment);
  const [items, setItems] = useState<UploadedFile[]>([]);
  const [linkInput, setLinkInput] = useState("");

  const notify = (updated: UploadedFile[]) => {
    onUrlsChange(updated.filter((i) => i.url).map((i) => i.url!));
  };

  const handleFiles = async (fileList: FileList) => {
    const toUpload = Array.from(fileList);
    const newItems: UploadedFile[] = toUpload.map((f) => ({
      clientId: `${Date.now()}_${Math.random()}_${f.name}`,
      filename: f.name,
      status: "uploading" as const,
    }));
    setItems((prev) => [...prev, ...newItems]);

    await Promise.all(
      toUpload.map(async (file, i) => {
        const clientId = newItems[i].clientId;
        try {
          const base64 = await fileToBase64(file);
          const result = await uploadFn({
            data: {
              base64,
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              bucket,
            },
          });
          setItems((prev) => {
            const updated = prev.map((x) =>
              x.clientId === clientId ? { ...x, url: result.url, status: "done" as const } : x,
            );
            notify(updated);
            return updated;
          });
        } catch {
          setItems((prev) => {
            const updated = prev.map((x) =>
              x.clientId === clientId ? { ...x, status: "error" as const } : x,
            );
            notify(updated);
            return updated;
          });
        }
      }),
    );
  };

  const addLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    const clientId = `link_${Date.now()}`;
    const filename = url.split("/").pop()?.split("?")[0] || url;
    setItems((prev) => {
      const updated = [...prev, { clientId, filename, url, status: "link" as const }];
      notify(updated);
      return updated;
    });
    setLinkInput("");
  };

  const remove = (clientId: string) => {
    setItems((prev) => {
      const updated = prev.filter((i) => i.clientId !== clientId);
      notify(updated);
      return updated;
    });
  };

  return (
    <div className="sm:col-span-2 space-y-2">
      <Label className="text-xs font-medium text-foreground/80">{label}</Label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/30 cursor-pointer py-4 transition-colors text-sm text-muted-foreground select-none"
      >
        <Upload className="size-4 shrink-0" />
        Seleccionar {isImage ? "imágenes" : "documentos"} del equipo
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
      />

      <div className="flex gap-2">
        <input
          type="text"
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          aria-label={isImage ? "URL de imagen" : "URL de documento"}
          placeholder={
            isImage
              ? "o pega URL (Google Drive, web...)"
              : "o pega URL de documento (Drive, web...)"
          }
          className="flex-1 h-8 px-3 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
        />
        <button
          type="button"
          onClick={addLink}
          className="h-8 px-3 text-xs rounded-md border border-input hover:bg-accent shrink-0"
        >
          Añadir
        </button>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.clientId}
              className="flex items-center gap-2 text-xs rounded-md border border-border px-2 py-1.5 bg-muted/30"
            >
              {item.status === "uploading" && (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
              {item.status === "done" && (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              )}
              {item.status === "error" && (
                <AlertCircle className="size-3.5 shrink-0 text-destructive" />
              )}
              {item.status === "link" && <Link2 className="size-3.5 shrink-0 text-primary" />}
              <span className="flex-1 truncate text-foreground/80">{item.filename}</span>
              <button
                type="button"
                onClick={() => remove(item.clientId)}
                aria-label={`Eliminar ${item.filename}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FormField({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const inner = (() => {
    if (def.kind === "orientacion") {
      return <OrientacionSelect value={value} onChange={onChange} />;
    }
    if (def.kind === "urls") {
      return (
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://ejemplo.com/foto1.jpg&#10;https://ejemplo.com/foto2.jpg"
          required={def.required}
        />
      );
    }
    if (def.kind === "select") {
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm w-full"
        >
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    if (def.kind === "textarea") {
      return (
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
        />
      );
    }
    if (def.kind === "number") {
      return (
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
        />
      );
    }
    if (def.kind === "date") {
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
        />
      );
    }
    return (
      <Input value={value} onChange={(e) => onChange(e.target.value)} required={def.required} />
    );
  })();
  return (
    <div className={def.full ? "sm:col-span-2" : ""}>
      <Field label={def.required ? `${def.label} *` : def.label}>{inner}</Field>
    </div>
  );
}

export function NewInmuebleDialog({
  defaultAlquiler = false,
  trigger,
}: {
  defaultAlquiler?: boolean;
  trigger?: ReactNode;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createInmueble);
  const [open, setOpen] = useState(false);
  const agentes = useQuery({ ...agentesQuery, enabled: open });
  const [tipo, setTipo] = useState<TipoInmueble | null>(null);
  const [values, setValues] = useState<Record<string, string>>({
    estatus: "Prospección",
  });
  const [ag, setAg] = useState<string[]>([]);
  const [propietarios, setPropietarios] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaExclusiva, setFechaExclusiva] = useState<string>("");
  const [observacionesPropietario, setObservacionesPropietario] = useState<string>("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [docUrls, setDocUrls] = useState<string[]>([]);

  const reset = () => {
    setTipo(null);
    setValues({ estatus: "Prospección" });
    setAg([]);
    setPropietarios([]);
    setFechaInicio(new Date().toISOString().slice(0, 10));
    setFechaExclusiva("");
    setObservacionesPropietario("");
    setImageUrls([]);
    setDocUrls([]);
  };

  const mut = useMutation({
    mutationFn: (payload: CreateInmueblePayload) => fn({ data: payload }),
    onSuccess: () => {
      toast.success("Inmueble creado");
      qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear"),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo) return;
    const payload: CreateInmueblePayload = {
      calle: values.calle ?? "",
      tipo,
      estatus: values.estatus || "Prospección",
      publicacion: values.publicacion || undefined,
      fechaInicio: fechaInicio || null,
      fechaExclusiva: fechaExclusiva || null,
      observacionesPropietario: observacionesPropietario || undefined,
      agentesIds: ag.length ? ag : undefined,
      propietariosIds: propietarios.length ? propietarios : undefined,
    };
    // Copy all string fields
    (Object.keys(values) as Array<keyof CreateInmueblePayload>).forEach((k) => {
      const v = values[k as string];
      if (v == null || v === "") return;
      if (k === "precio") {
        const n = Number(v);
        if (Number.isFinite(n)) (payload as Record<string, unknown>).precio = n;
      } else if (k === "imagenesUrls" || k === "documentacionUrls") {
        // handled by FileUploadField — skip
      } else {
        (payload as Record<string, unknown>)[k as string] = v;
      }
    });
    if (imageUrls.length) payload.imagenesUrls = imageUrls;
    if (docUrls.length) payload.documentacionUrls = docUrls;
    mut.mutate(payload);
  };

  const schema = tipo ? getSchemaForTipo(tipo) : [];
  const esAlquiler = tipo?.startsWith("Alquiler");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      {trigger ?? <NewButton>{defaultAlquiler ? "Nuevo alquiler" : "Nuevo inmueble"}</NewButton>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tipo ? `Nuevo ${tipo.toLowerCase()}` : "Nuevo inmueble — Selecciona tipo"}
          </DialogTitle>
          <DialogDescription>
            {tipo
              ? "Rellena los campos y se guardarán en la base de datos."
              : "Primero selecciona el tipo de inmueble que quieres dar de alta."}
          </DialogDescription>
        </DialogHeader>

        {!tipo ? (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground mb-2">
                Venta
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {TIPOS_VENTA.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="flex flex-col items-center gap-1 py-3 px-2 rounded-lg border border-input hover:border-primary hover:bg-accent transition-colors text-sm font-medium"
                  >
                    <span className="text-2xl">{ICONOS_TIPO[t] ?? "🏷️"}</span>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground mb-2">
                Alquiler
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {TIPOS_ALQUILER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="flex flex-col items-center gap-1 py-3 px-2 rounded-lg border border-input hover:border-primary hover:bg-accent transition-colors text-sm font-medium"
                  >
                    <span className="text-2xl">
                      {ICONOS_TIPO[t.replace(/^Alquiler\s+/, "")] ?? "🏷️"}
                    </span>
                    <span className="text-xs">{t.replace(/^Alquiler\s+/, "")}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center justify-between text-xs text-muted-foreground -mb-1">
              <button
                type="button"
                onClick={() => setTipo(null)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                ← Cambiar tipo
              </button>
            </div>

            {/* Tipo de inmueble visible como campo del formulario */}
            <div className="sm:col-span-2">
              <Field label="Tipo de inmueble">
                <div className="h-9 px-3 rounded-md border border-input bg-muted text-sm flex items-center gap-2 select-none">
                  <span className="text-lg">
                    {ICONOS_TIPO[tipo.replace(/^Alquiler\s+/, "")] ?? "🏷️"}
                  </span>
                  <span className="font-medium">{tipo}</span>
                  {esAlquiler && <span className="text-xs text-muted-foreground">(alquiler)</span>}
                </div>
              </Field>
            </div>

            {schema
              .filter((def) => def.key !== "imagenesUrls" && def.key !== "documentacionUrls")
              .map((def) => (
                <FormField
                  key={def.key as string}
                  def={def}
                  value={values[def.key as string] ?? ""}
                  onChange={(v) => setValues((s) => ({ ...s, [def.key as string]: v }))}
                />
              ))}

            <FileUploadField
              label="Imágenes"
              bucket="property-images"
              accept="image/*"
              isImage={true}
              onUrlsChange={setImageUrls}
            />

            <FileUploadField
              label="Documentación"
              bucket="property-docs"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              isImage={false}
              onUrlsChange={setDocUrls}
            />

            <div className="sm:col-span-2">
              <Field label="Agentes asignados">
                <MultiSelect
                  options={(agentes.data?.agentes ?? []).map((a) => ({
                    id: a.id,
                    label: a.nombre,
                  }))}
                  value={ag}
                  onChange={setAg}
                />
              </Field>
            </div>

            <PropietarioBlock
              selected={propietarios}
              onChange={setPropietarios}
              fechaInicio={fechaInicio}
              setFechaInicio={setFechaInicio}
              fechaExclusiva={fechaExclusiva}
              setFechaExclusiva={setFechaExclusiva}
              observaciones={observacionesPropietario}
              setObservaciones={setObservacionesPropietario}
              esAlquiler={!!esAlquiler}
            />

            <DialogFooter className="sm:col-span-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                Crear
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
