import { useMemo } from "react";
import {
  Phone,
  MessageCircle,
  Globe,
  Bot,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import type { Cliente } from "@/lib/clientes.functions";

export type Canal = "WhatsApp" | "Llamada" | "Idealista" | "Otro";

export function inferCanal(c: Cliente): Canal {
  const txt = `${c.solicitud} ${c.motivo} ${c.conversaciones} ${c.seccion}`.toLowerCase();
  if (/idealista/.test(txt)) return "Idealista";
  if (/whats|wa\b|wsp/.test(txt)) return "WhatsApp";
  if (/llamad|tel[eé]fono|call/.test(txt) || c.motivo) return "Llamada";
  return "Otro";
}

export function hasSilviaConversation(c: Cliente): boolean {
  return (c.motivo?.trim().length ?? 0) > 0 || (c.conversaciones?.trim().length ?? 0) > 0;
}

const CANAL_MAP: Record<Canal, { cls: string; icon: typeof Phone }> = {
  WhatsApp: {
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    icon: MessageCircle,
  },
  Llamada: {
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    icon: Phone,
  },
  Idealista: {
    cls: "bg-[#e8f5b8] text-[#5a6b1a] dark:bg-lime-500/20 dark:text-lime-300",
    icon: Globe,
  },
  Otro: {
    cls: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    icon: Bot,
  },
};

export function CanalChip({ canal, size = "sm" }: { canal: Canal; size?: "sm" | "xs" }) {
  const { cls, icon: Icon } = CANAL_MAP[canal];
  const sz =
    size === "xs"
      ? "px-1.5 py-0.5 text-[10px]"
      : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sz} ${cls}`}>
      <Icon className="size-3" />
      {canal}
    </span>
  );
}

export function SilviaIndicator({ canal }: { canal: Canal }) {
  const { cls, icon: Icon } = CANAL_MAP[canal];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={`Conversación de Silvia · ${canal}`}
    >
      <Sparkles className="size-2.5" />
      <Icon className="size-2.5" />
    </span>
  );
}

// ---------------- Transcripción parser ----------------

type Block =
  | { kind: "date"; text: string }
  | { kind: "ref"; text: string }
  | { kind: "divider" }
  | { kind: "field"; label: string; value: string }
  | { kind: "para"; text: string }
  | { kind: "heading"; text: string };

const DATE_RE =
  /^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)\s*[-–—:]?\s*(.*)$/;
const REF_RE = /^(?:Ref\.?|Referencia|Código(?:\s+del\s+anuncio)?)\s*[:.]?\s*([A-Z0-9-]+)\s*$/i;
const FIELD_RE = /^([A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,30}):\s*(.+)$/;
const URL_RE = /(https?:\/\/[^\s)]+)/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&#8364;|&euro;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseTranscript(raw: string): Block[] {
  const text = decodeEntities(raw).replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n").map((l) => l.trim());
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^[-–—_=*]{2,}$/.test(line) || line === "-") {
      if (blocks.at(-1)?.kind !== "divider") blocks.push({ kind: "divider" });
      continue;
    }
    const refM = line.match(REF_RE);
    if (refM) {
      blocks.push({ kind: "ref", text: refM[1] });
      continue;
    }
    const dateM = line.match(DATE_RE);
    if (dateM && dateM[1]) {
      blocks.push({ kind: "date", text: dateM[1] });
      const rest = dateM[2]?.trim();
      if (rest) blocks.push({ kind: "para", text: rest });
      continue;
    }
    if (/^(motivo|asunto|mensaje|nota|resumen)\b/i.test(line) && line.length < 40) {
      blocks.push({ kind: "heading", text: line.replace(/[:：]$/, "") });
      continue;
    }
    const fieldM = line.match(FIELD_RE);
    if (
      fieldM &&
      fieldM[1].length < 25 &&
      !/^https?$/i.test(fieldM[1]) &&
      fieldM[2].length < 200
    ) {
      blocks.push({ kind: "field", label: fieldM[1].trim(), value: fieldM[2].trim() });
      continue;
    }
    blocks.push({ kind: "para", text: line });
  }
  return blocks;
}

function linkify(text: string) {
  const parts = text.split(URL_RE);
  return parts.map((p, i) =>
    URL_RE.test(p) ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noreferrer"
        className="text-violet-600 dark:text-violet-400 hover:underline break-all"
      >
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function Transcripcion({ text }: { text: string }) {
  const blocks = useMemo(() => parseTranscript(text), [text]);
  if (blocks.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sin transcripción.</p>;
  }
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-foreground/85">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "date":
            return (
              <div key={i} className="flex items-center gap-2 pt-2 first:pt-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-background border border-border px-2 py-0.5 rounded-full">
                  <CalendarDays className="size-3" />
                  {b.text}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            );
          case "divider":
            return <hr key={i} className="my-2 border-border/60" />;
          case "ref":
            return (
              <div key={i} className="pl-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold bg-violet-500/10 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded">
                  Ref. {b.text}
                </span>
              </div>
            );
          case "heading":
            return (
              <div
                key={i}
                className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-2"
              >
                {b.text}
              </div>
            );
          case "field":
            return (
              <div key={i} className="pl-3 flex gap-2 text-xs">
                <span className="text-muted-foreground min-w-[90px] shrink-0">{b.label}:</span>
                <span className="text-foreground/90 break-words">{linkify(b.value)}</span>
              </div>
            );
          case "para":
          default:
            return (
              <p key={i} className="pl-3 text-foreground/85 break-words">
                {linkify(b.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
