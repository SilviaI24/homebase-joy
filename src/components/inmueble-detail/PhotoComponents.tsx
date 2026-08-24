// M-03: extraído de src/routes/inmuebles.$id.tsx.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { addImagenToInmueble } from "@/lib/inmuebles.functions";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
  });
}

export function PhotoUpload({
  propertyId,
  onUploaded,
}: {
  propertyId: string;
  onUploaded: (url: string) => void;
}) {
  const addFn = useServerFn(addImagenToInmueble);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<
    Array<{ name: string; status: "uploading" | "done" | "error" }>
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (const file of images) {
      setUploading((u) => [...u, { name: file.name, status: "uploading" }]);
      try {
        const base64 = await fileToBase64(file);
        const { url } = await addFn({
          data: { id: propertyId, base64, filename: file.name, mimeType: file.type },
        });
        setUploading((u) => u.map((x) => (x.name === file.name ? { ...x, status: "done" } : x)));
        onUploaded(url);
      } catch {
        setUploading((u) => u.map((x) => (x.name === file.name ? { ...x, status: "error" } : x)));
      }
    }
    setTimeout(() => setUploading([]), 3000);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`px-3 py-3 border-t border-border bg-card transition-colors ${isDragging ? "bg-primary/5" : ""}`}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-dashed border-border hover:border-primary/60 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ImagePlus className="size-3.5" />
          Añadir fotos
        </button>
        {uploading.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">o arrastra imágenes aquí</span>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {uploading.map((u) => (
              <span
                key={u.name}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                  u.status === "uploading"
                    ? "bg-muted text-muted-foreground"
                    : u.status === "done"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                }`}
              >
                {u.status === "uploading" && <Loader2 className="size-3 animate-spin" />}
                {u.status === "done" && <Check className="size-3" />}
                {u.status === "error" && <X className="size-3" />}
                {u.name.length > 24 ? u.name.slice(0, 22) + "…" : u.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {isDragging && (
        <div className="mt-2 text-[11px] text-primary text-center py-2 border border-dashed border-primary/40 rounded-md">
          Suelta las imágenes aquí
        </div>
      )}
    </div>
  );
}

export function ImagenesReorder({
  imagenes,
  mainImg,
  onSetMain,
  onReorder,
}: {
  imagenes: Array<{ id: string; url: string }>;
  mainImg: string | null;
  onSetMain: (url: string) => void;
  onReorder: (next: Array<{ id: string; url: string }>) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = imagenes.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onReorder(next);
  };
  return (
    <div className="px-3 py-3 border-t border-border bg-card">
      <div className="text-[11px] text-muted-foreground mb-2">
        Arrastra para reordenar las fotos. El nuevo orden se guarda al pulsar “Guardar”.
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {imagenes.map((img, idx) => {
          const active = mainImg === img.url;
          const over = overIdx === idx && dragIdx !== null && dragIdx !== idx;
          return (
            <div
              key={img.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIdx(idx);
              }}
              onDragLeave={() => setOverIdx((o) => (o === idx ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null) move(dragIdx, idx);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              className={`relative shrink-0 cursor-grab active:cursor-grabbing transition-all ${
                dragIdx === idx ? "opacity-40" : ""
              } ${over ? "scale-105" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSetMain(img.url)}
                aria-label={`Usar como foto principal (${idx + 1} de ${imagenes.length})`}
                className={`block size-16 rounded-md overflow-hidden border-2 ${
                  active
                    ? "border-primary ring-2 ring-primary/30"
                    : over
                      ? "border-primary"
                      : "border-border hover:border-primary/60"
                }`}
              >
                <SafeImage src={img.url} alt="" />
              </button>
              <span className="absolute -top-1.5 -left-1.5 bg-background border border-border rounded-full size-5 text-[10px] font-mono flex items-center justify-center text-muted-foreground">
                {idx + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
