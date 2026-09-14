// M-03: extraído de src/routes/visitas.index.tsx.
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import type { VisitaFull } from "@/lib/visitas.functions";
import { ESTADO_COLORS, fmtTime, getMonday } from "@/lib/visitas-format";

export function EmptyChart() {
  return (
    <div className="h-[210px] flex items-center justify-center text-sm text-muted-foreground">
      Sin datos para el periodo
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon: typeof TrendingUp;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </h3>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ── CalendarSemanal ────────────────────────────────────────────────────────────

const HOUR_START = 8;
const HOUR_END = 21;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

export function CalendarSemanal({
  visitas,
  inmIndex,
  now,
}: {
  visitas: VisitaFull[];
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
}) {
  const [weekStart, setWeekStart] = useState(() => getMonday(now));
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [miniMonth, setMiniMonth] = useState(() => ({
    year: new Date(now).getFullYear(),
    month: new Date(now).getMonth(),
  }));

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart + i * 86400000);
        return {
          key: d.toISOString().slice(0, 10),
          date: d,
          label: d.toLocaleDateString("es-ES", { weekday: "short" }).toUpperCase().slice(0, 3),
          num: d.getDate(),
        };
      }),
    [weekStart],
  );

  const visitsByDayHour = useMemo(() => {
    const map = new Map<string, VisitaFull[]>();
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const d = new Date(v.fecha);
      const hourKey = `${d.toISOString().slice(0, 10)}-${d.getHours()}`;
      if (!map.has(hourKey)) map.set(hourKey, []);
      map.get(hourKey)!.push(v);
    });
    return map;
  }, [visitas]);

  const daysWithVisits = useMemo(() => {
    const s = new Set<string>();
    visitas.forEach((v) => v.fecha && s.add(v.fecha.slice(0, 10)));
    return s;
  }, [visitas]);

  const selectedVisits = useMemo(
    () =>
      visitas
        .filter((v) => v.fecha?.slice(0, 10) === selectedDay)
        .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")),
    [visitas, selectedDay],
  );

  const weekStats = useMemo(() => {
    const keys = new Set(weekDays.map((d) => d.key));
    const inWeek = visitas.filter((v) => v.fecha && keys.has(v.fecha.slice(0, 10)));
    return {
      total: inWeek.length,
      realizadas: inWeek.filter((v) => v.estado === "Realizada").length,
      pendientes: inWeek.filter((v) => v.estado === "Programada").length,
    };
  }, [visitas, weekDays]);

  const weekLabel = (() => {
    const a = weekDays[0];
    const z = weekDays[6];
    if (a.date.getMonth() === z.date.getMonth())
      return `${a.num} – ${z.num} ${z.date.toLocaleDateString("es-ES", { month: "short" })}`;
    return `${a.num} ${a.date.toLocaleDateString("es-ES", { month: "short" })} – ${z.num} ${z.date.toLocaleDateString("es-ES", { month: "short" })}`;
  })();

  function prevWeek() {
    setWeekStart((w) => w - 7 * 86400000);
  }
  function nextWeek() {
    setWeekStart((w) => w + 7 * 86400000);
  }
  function goToday() {
    setWeekStart(getMonday(now));
    setSelectedDay(todayStr);
  }

  function handleDaySelect(dateStr: string) {
    setSelectedDay(dateStr);
    setWeekStart(getMonday(new Date(dateStr + "T12:00:00").getTime()));
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20">
        <CalendarDays className="size-4 text-muted-foreground shrink-0" />
        <h3 className="text-sm font-semibold flex-1">Calendario</h3>
        <button
          onClick={goToday}
          className="px-3 h-7 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors"
        >
          Hoy
        </button>
        <button
          onClick={prevWeek}
          className="size-7 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="text-xs font-semibold min-w-[120px] text-center">{weekLabel}</span>
        <button
          onClick={nextWeek}
          className="size-7 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground"
        >
          <ChevronRight className="size-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <NewVisitaDialog />
      </div>

      {/* Body: left | grid | right */}
      <div className="grid grid-cols-[200px_1fr_190px] divide-x divide-border">
        {/* ── Left sidebar ── */}
        <div className="p-3 space-y-5 overflow-y-auto max-h-[620px]">
          <MiniCalendar
            year={miniMonth.year}
            month={miniMonth.month}
            today={todayStr}
            selected={selectedDay}
            weekStart={weekStart}
            daysWithVisits={daysWithVisits}
            onSelectDay={handleDaySelect}
            onPrevMonth={() =>
              setMiniMonth(({ year, month }) =>
                month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
              )
            }
            onNextMonth={() =>
              setMiniMonth(({ year, month }) =>
                month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
              )
            }
          />
          <div>
            <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-2">
              Tipo de evento
            </div>
            {Object.entries(ESTADO_COLORS).map(([estado, color]) => (
              <div key={estado} className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="inline-block size-2 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span className="text-xs text-foreground/80">{estado}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Week grid ── */}
        <div className="overflow-auto max-h-[620px]">
          {/* Day headers */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] sticky top-0 bg-card z-10 border-b border-border">
            <div />
            {weekDays.map((d) => {
              const isToday = d.key === todayStr;
              const isSel = d.key === selectedDay;
              const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
              return (
                <button
                  key={d.key}
                  onClick={() => setSelectedDay(d.key)}
                  className={`flex flex-col items-center py-2 border-l border-border transition-colors hover:bg-accent/40 ${isSel ? "bg-primary/5" : isWeekend ? "bg-muted/30" : ""}`}
                >
                  <span className="text-[9px] font-semibold tracking-widest text-muted-foreground">
                    {d.label}
                  </span>
                  <span
                    className={`mt-1 w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${isToday ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {d.num}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hour rows */}
          {HOURS.map((h) => (
            <div
              key={h}
              className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border/40 min-h-[56px]"
            >
              <div className="text-[9px] text-muted-foreground px-1.5 pt-1 text-right border-r border-border/40 select-none">
                {String(h).padStart(2, "0")}:00
              </div>
              {weekDays.map((d) => {
                const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
                const isSel = d.key === selectedDay;
                const isToday = d.key === todayStr;
                const cellVisits = visitsByDayHour.get(`${d.key}-${h}`) ?? [];
                return (
                  <div
                    key={d.key}
                    className={`border-l border-border/40 p-0.5 ${
                      isSel
                        ? "bg-primary/[0.04]"
                        : isToday
                          ? "bg-primary/[0.02]"
                          : isWeekend
                            ? "bg-muted/20"
                            : ""
                    }`}
                  >
                    {cellVisits.map((v) => {
                      const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";
                      const inmId = v.inmuebleIds[0];
                      const meta = inmId ? inmIndex.get(inmId) : null;
                      const label = meta ? meta.calle.trim() : v.actividad || "Visita";
                      const mins = v.fecha ? new Date(v.fecha).getMinutes() : 0;
                      const timeStr = `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
                      const chip = (
                        <div
                          className="text-[9px] leading-tight rounded px-1 py-0.5 mb-0.5 cursor-pointer hover:opacity-75 transition-opacity overflow-hidden"
                          style={{ background: `${color}18`, borderLeft: `2px solid ${color}` }}
                          title={`${timeStr} · ${label}`}
                        >
                          <div className="font-semibold tabular-nums" style={{ color }}>
                            {timeStr}
                          </div>
                          <div className="truncate text-foreground/80">{label}</div>
                        </div>
                      );
                      return inmId ? (
                        <Link key={v.id} to="/inmuebles/$id" params={{ id: inmId }}>
                          {chip}
                        </Link>
                      ) : (
                        <div key={v.id}>{chip}</div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Right sidebar ── */}
        <div className="p-3 space-y-5 overflow-y-auto max-h-[620px]">
          {/* Selected day detail */}
          <div>
            <div className="text-sm font-semibold">
              {selectedDay === todayStr
                ? "Hoy"
                : new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {selectedVisits.length === 0
                ? "Sin eventos"
                : `${selectedVisits.length} ${selectedVisits.length === 1 ? "evento" : "eventos"}`}
            </div>
            {selectedVisits.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                Día sin eventos.
              </div>
            ) : (
              <div className="space-y-1.5">
                {selectedVisits.map((v) => {
                  const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";
                  const inmId = v.inmuebleIds[0];
                  const meta = inmId ? inmIndex.get(inmId) : null;
                  const label = meta
                    ? `${meta.calle} ${meta.numero || ""}`.trim()
                    : v.actividad || "Visita";
                  return (
                    <div
                      key={v.id}
                      className="rounded-md border border-border p-2 text-xs leading-snug"
                      style={{ borderLeftColor: color, borderLeftWidth: 2 }}
                    >
                      <div className="font-semibold tabular-nums text-foreground">
                        {fmtTime(v.fecha) || "—"}
                      </div>
                      {inmId ? (
                        <Link
                          to="/inmuebles/$id"
                          params={{ id: inmId }}
                          className="truncate text-foreground/80 hover:text-primary transition-colors block"
                        >
                          {label}
                        </Link>
                      ) : (
                        <div className="truncate text-foreground/80">{label}</div>
                      )}
                      {v.clientesNombres.length > 0 && (
                        <div className="truncate text-muted-foreground">{v.clientesNombres[0]}</div>
                      )}
                      <div className="font-medium mt-0.5" style={{ color }}>
                        {v.estado}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Week stats */}
          <div>
            <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-3">
              Esta semana
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                { label: "Visitas", val: weekStats.total, color: "" },
                { label: "Realizadas", val: weekStats.realizadas, color: "" },
                {
                  label: "Pendientes",
                  val: weekStats.pendientes,
                  color: weekStats.pendientes > 0 ? "text-warning" : "",
                },
              ].map(({ label, val, color }) => (
                <div key={label} className="rounded-md border border-border p-2">
                  <div className={`text-xl font-semibold tabular-nums ${color}`}>{val}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MiniCalendar ───────────────────────────────────────────────────────────────
// Usado exclusivamente desde CalendarSemanal (sidebar izquierdo) — se mantiene
// en este archivo en vez de en ListaDiariaPanel, ajuste sobre el reparto
// propuesto inicialmente.

function MiniCalendar({
  year,
  month,
  today,
  selected,
  weekStart,
  daysWithVisits,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  today: string;
  selected: string;
  weekStart: number;
  daysWithVisits: Set<string>;
  onSelectDay: (d: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function isInWeek(day: number) {
    const ts = new Date(year, month, day).getTime();
    return ts >= weekStart && ts < weekStart + 7 * 86400000;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onPrevMonth}
          className="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors"
        >
          <ChevronLeft className="size-3" />
        </button>
        <span className="text-[11px] font-semibold capitalize">{monthLabel}</span>
        <button
          onClick={onNextMonth}
          className="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors"
        >
          <ChevronRight className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[9px]">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <div key={d} className="text-muted-foreground font-semibold pb-1">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const ds = dateStr(day);
          const isTod = ds === today;
          const isSel = ds === selected;
          const inWk = isInWeek(day);
          const hasV = daysWithVisits.has(ds);
          return (
            <button
              key={day}
              onClick={() => onSelectDay(ds)}
              className={`relative h-6 w-full flex items-center justify-center rounded text-[10px] transition-colors leading-none
                ${
                  isSel
                    ? "bg-primary text-primary-foreground font-bold"
                    : isTod
                      ? "bg-primary/20 text-primary font-semibold"
                      : inWk
                        ? "bg-primary/8 text-foreground"
                        : "text-foreground/70 hover:bg-accent"
                }`}
            >
              {day}
              {hasV && !isSel && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary opacity-60" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
