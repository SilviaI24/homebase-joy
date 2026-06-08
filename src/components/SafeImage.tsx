import { useEffect, useState } from "react";
import { Building2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Imagen con cadena de fallbacks:
 *   src → fallbackSrc → icono.
 * Mantiene el mismo box-model y evita huecos rotos o placeholders distintos.
 */
export function SafeImage({
  src,
  fallbackSrc,
  alt,
  className,
  imgClassName,
  fallbackIcon: Icon = Building2,
  fallbackClassName,
}: {
  src: string | null | undefined;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  fallbackIcon?: LucideIcon;
  fallbackClassName?: string;
}) {
  const initial = src || fallbackSrc || null;
  const [current, setCurrent] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);

  // Reset state if the inputs change between renders (key changes etc.).
  useEffect(() => {
    setCurrent(src || fallbackSrc || null);
    setFailed(false);
  }, [src, fallbackSrc]);

  const showIcon = !current || failed;

  return (
    <div className={cn("relative w-full h-full bg-muted overflow-hidden", className)}>
      {showIcon ? (
        <div
          className={cn(
            "w-full h-full flex items-center justify-center text-muted-foreground",
            fallbackClassName,
          )}
        >
          <Icon className="size-8" />
        </div>
      ) : (
        <img
          src={current}
          alt={alt}
          loading="lazy"
          onError={() => {
            // Intenta el fallback antes de rendirse.
            if (current !== fallbackSrc && fallbackSrc) {
              setCurrent(fallbackSrc);
            } else {
              setFailed(true);
            }
          }}
          className={cn("w-full h-full object-cover", imgClassName)}
        />
      )}
    </div>
  );
}
