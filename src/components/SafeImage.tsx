import { useState } from "react";
import { Building2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Imagen con fallback visual cuando la URL falla o no existe.
 * Mantiene el mismo box-model que un <img>, evitando huecos rotos y
 * placeholders inconsistentes a lo largo de la app.
 */
export function SafeImage({
  src,
  alt,
  className,
  imgClassName,
  fallbackIcon: Icon = Building2,
  fallbackClassName,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  fallbackIcon?: LucideIcon;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={cn("relative w-full h-full bg-muted overflow-hidden", className)}>
      {showFallback ? (
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
          src={src!}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn("w-full h-full object-cover", imgClassName)}
        />
      )}
    </div>
  );
}
