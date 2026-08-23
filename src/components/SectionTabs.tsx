import type { ReactNode } from "react";

interface Tab<T extends string = string> {
  key: T;
  label: ReactNode;
}

export function SectionTabs<T extends string = string>({
  tabs,
  value,
  onChange,
  className = "mb-6",
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0 border-b border-border overflow-x-auto ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px cursor-pointer ${
            t.key === value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
