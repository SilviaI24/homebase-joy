// M-03: extraído de src/routes/inmuebles.$id.tsx (DetailView). Recibe el
// estado de imágenes por props (mainImg/imagenesOrder + sus setters) — el
// estado en sí sigue en DetailView.
import type { Dispatch, SetStateAction } from "react";
import { MapPin, Hash, BedDouble, Bath, Ruler } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { PhotoUpload, ImagenesReorder } from "@/components/inmueble-detail/PhotoComponents";
import { formatEuro, statusTint } from "@/lib/inmueble-detail-format";
import { cleanRef } from "@/lib/format";
import type { InmuebleDetalle } from "@/lib/inmuebles.functions";

export function HeroImagePanel({
  inmueble,
  detailReady,
  id,
  mainImg,
  setMainImg,
  imagenesOrder,
  setImagenesOrder,
}: {
  inmueble: InmuebleDetalle;
  detailReady: boolean;
  id: string;
  mainImg: string | null;
  setMainImg: (v: string | null) => void;
  imagenesOrder: Array<{ id: string; url: string }>;
  setImagenesOrder: Dispatch<SetStateAction<Array<{ id: string; url: string }>>>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="relative aspect-[4/3] bg-muted">
        <SafeImage
          src={mainImg}
          fallbackSrcs={imagenesOrder.filter((i) => i.url !== mainImg).map((i) => i.url)}
          alt={inmueble.calle || "Inmueble"}
        />
        {/* Top chips */}
        <div className="absolute inset-x-0 top-0 p-4 flex items-start justify-between pointer-events-none">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-sm ${statusTint(
              inmueble.estatus,
            )}`}
          >
            <span className="size-1.5 rounded-full bg-current opacity-80" />
            {inmueble.estatus || "—"}
          </span>
          {inmueble.ref && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold bg-background text-foreground border border-border/60 px-2 py-1 rounded-full shadow-sm">
              <Hash className="size-3" />
              {cleanRef(inmueble.ref)}
            </span>
          )}
        </div>
        {/* Bottom overlay */}
        <div className="absolute inset-x-0 bottom-0 px-6 pt-20 pb-5 bg-gradient-to-t from-black/85 via-black/55 to-transparent text-white">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight">
                {inmueble.calle || "Sin dirección"}{" "}
                {inmueble.numero && (
                  <span className="text-white/80 font-normal">{inmueble.numero}</span>
                )}
              </h2>
              <div className="text-sm text-white/85 flex items-center gap-1.5 mt-1">
                <MapPin className="size-3.5" />
                {[inmueble.barrio, inmueble.localidad].filter(Boolean).join(", ") || "—"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-3xl sm:text-4xl font-bold leading-none tracking-tight tabular-nums">
                {formatEuro(inmueble.precio)}
              </div>
              {inmueble.precioFinal ? (
                <div className="text-xs text-white/75 mt-1">
                  Cerrado en {formatEuro(inmueble.precioFinal)}
                </div>
              ) : null}
            </div>
          </div>
          {(inmueble.habitaciones || inmueble.banos || inmueble.superficie || inmueble.tipo) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
              {inmueble.tipo && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {inmueble.tipo}
                </span>
              )}
              {inmueble.habitaciones && (
                <span className="inline-flex items-center gap-1.5">
                  <BedDouble className="size-4" /> {inmueble.habitaciones} hab.
                </span>
              )}
              {inmueble.banos && (
                <span className="inline-flex items-center gap-1.5">
                  <Bath className="size-4" /> {inmueble.banos} baños
                </span>
              )}
              {inmueble.superficie && (
                <span className="inline-flex items-center gap-1.5">
                  <Ruler className="size-4" /> {inmueble.superficie} m²
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {detailReady && imagenesOrder.length > 1 && (
        <ImagenesReorder
          imagenes={imagenesOrder}
          mainImg={mainImg}
          onSetMain={setMainImg}
          onReorder={setImagenesOrder}
        />
      )}
      {detailReady && (
        <PhotoUpload
          propertyId={id}
          onUploaded={(url) => {
            const newItem = { id: url, url };
            setImagenesOrder((prev) => [...prev, newItem]);
            if (!mainImg) setMainImg(url);
          }}
        />
      )}
    </div>
  );
}
