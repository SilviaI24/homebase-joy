import { useEffect, useRef, useState } from "react";
import { Building2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Imagen con cadena de fallbacks:
 *   src → fallbackSrcs[0..n] → fallbackSrc → icono.
 * Mantiene el mismo box-model y evita huecos rotos o placeholders distintos.
 */
export function SafeImage({
  src,
  fallbackSrc,
  fallbackSrcs,
  alt,
  className,
  imgClassName,
  fallbackIcon: Icon = Building2,
  fallbackClassName,
}: {
  src: string | null | undefined;
  fallbackSrc?: string | null;
  fallbackSrcs?: string[];
  alt: string;
  className?: string;
  imgClassName?: string;
  fallbackIcon?: LucideIcon;
  fallbackClassName?: string;
}) {
  // Build the full ordered chain: src → fallbackSrcs → fallbackSrc
  const chain = useRef<string[]>([]);
  chain.current = [
    ...(src ? [src] : []),
    ...(fallbackSrcs ?? []),
    ...(fallbackSrc ? [fallbackSrc] : []),
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);
  const fallbackSrcsKey = fallbackSrcs?.join(",");

  useEffect(() => {
    setIdx(0);
  }, [src, fallbackSrc, fallbackSrcsKey]);

  const current = chain.current[idx] ?? null;
  const showIcon = !current;

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
          decoding="async"
          draggable={false}
          onError={() => {
            if (idx + 1 < chain.current.length) {
              setIdx((i) => i + 1);
            } else {
              setIdx(chain.current.length); // past end → showIcon
            }
          }}
          className={cn("w-full h-full object-cover", imgClassName)}
        />
      )}
    </div>
  );
}
