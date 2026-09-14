// M-03: extraído de src/routes/inmuebles.$id.tsx (DetailView). El estado en
// sí (los ~17 campos) sigue viviendo en DetailView — este componente solo
// recibe cada valor y su setter por props, sin cerrar sobre nada del padre.
import { useState } from "react";
import { SkeletonLine } from "@/components/inmueble-detail/SkeletonLine";

const ORIENTACION_OPTS = [
  "Norte",
  "Sur",
  "Este",
  "Oeste",
  "Noreste",
  "Noroeste",
  "Sureste",
  "Suroeste",
];

function OrientacionDetailSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [custom, setCustom] = useState(() => value !== "" && !ORIENTACION_OPTS.includes(value));
  if (custom) {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 w-full h-8 px-2 rounded border border-input bg-background text-sm"
          placeholder="Escribe orientación…"
        />
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
          className="h-8 px-2 rounded border border-input bg-background text-sm text-muted-foreground hover:bg-accent"
        >
          ✕
        </button>
      </div>
    );
  }
  return (
    <select
      value={ORIENTACION_OPTS.includes(value) ? value : ""}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setCustom(true);
          onChange("");
        } else onChange(e.target.value);
      }}
      className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
    >
      <option value="">—</option>
      {ORIENTACION_OPTS.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__custom__">+ Personalizado…</option>
    </select>
  );
}

function EditSpecField({
  label,
  value,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "select" | "orientacion";
  options?: string[];
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
        {label}
      </div>
      {type === "select" && options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : type === "orientacion" ? (
        <OrientacionDetailSelect value={value} onChange={onChange} />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
        />
      )}
    </div>
  );
}

export function CaracteristicasPanel({
  detailReady,
  tipo,
  habitaciones,
  setHabitaciones,
  banos,
  setBanos,
  superficie,
  setSuperficie,
  planta,
  setPlanta,
  estado,
  setEstado,
  anoConstruccion,
  setAnoConstruccion,
  certificacionEnergetica,
  setCertificacionEnergetica,
  calefaccion,
  setCalefaccion,
  orientacion,
  setOrientacion,
  garaje,
  setGaraje,
  trastero,
  setTrastero,
  ascensor,
  setAscensor,
  armariosEmpotrados,
  setArmariosEmpotrados,
  terraza,
  setTerraza,
  balcon,
  setBalcon,
  gastosComunidad,
  setGastosComunidad,
  referenciaCatastral,
  setReferenciaCatastral,
}: {
  detailReady: boolean;
  tipo: string;
  habitaciones: string;
  setHabitaciones: (v: string) => void;
  banos: string;
  setBanos: (v: string) => void;
  superficie: string;
  setSuperficie: (v: string) => void;
  planta: string;
  setPlanta: (v: string) => void;
  estado: string;
  setEstado: (v: string) => void;
  anoConstruccion: string;
  setAnoConstruccion: (v: string) => void;
  certificacionEnergetica: string;
  setCertificacionEnergetica: (v: string) => void;
  calefaccion: string;
  setCalefaccion: (v: string) => void;
  orientacion: string;
  setOrientacion: (v: string) => void;
  garaje: string;
  setGaraje: (v: string) => void;
  trastero: string;
  setTrastero: (v: string) => void;
  ascensor: string;
  setAscensor: (v: string) => void;
  armariosEmpotrados: string;
  setArmariosEmpotrados: (v: string) => void;
  terraza: string;
  setTerraza: (v: string) => void;
  balcon: string;
  setBalcon: (v: string) => void;
  gastosComunidad: string;
  setGastosComunidad: (v: string) => void;
  referenciaCatastral: string;
  setReferenciaCatastral: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-display text-base font-semibold mb-4">Características</h3>
      {!detailReady ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-border bg-background px-3 py-2.5 space-y-1"
            >
              <SkeletonLine className="w-1/2" />
              <SkeletonLine className="w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tipo — read-only */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                Tipo
              </div>
              <div className="h-8 px-2 flex items-center rounded border border-input bg-muted text-sm text-muted-foreground">
                {tipo || "—"}
              </div>
            </div>
            <EditSpecField label="Habitaciones" value={habitaciones} onChange={setHabitaciones} />
            <EditSpecField label="Baños" value={banos} onChange={setBanos} />
            <EditSpecField label="Superficie (m²)" value={superficie} onChange={setSuperficie} />
            <EditSpecField label="Planta" value={planta} onChange={setPlanta} />
            <EditSpecField
              label="Estado"
              value={estado}
              onChange={setEstado}
              type="select"
              options={[
                "Nuevo",
                "A reformar",
                "Reformado",
                "Buen estado",
                "Para entrar",
                "Obra nueva",
              ]}
            />
            <EditSpecField
              label="Año construcción"
              value={anoConstruccion}
              onChange={setAnoConstruccion}
            />
            <EditSpecField
              label="Cert. energética"
              value={certificacionEnergetica}
              onChange={setCertificacionEnergetica}
            />
            <EditSpecField label="Calefacción" value={calefaccion} onChange={setCalefaccion} />
            <EditSpecField
              label="Orientación"
              value={orientacion}
              onChange={setOrientacion}
              type="orientacion"
            />
            <EditSpecField
              label="Garaje"
              value={garaje}
              onChange={setGaraje}
              type="select"
              options={["Sí", "No", "Opcional"]}
            />
            <EditSpecField
              label="Trastero"
              value={trastero}
              onChange={setTrastero}
              type="select"
              options={["Sí", "No"]}
            />
            <EditSpecField
              label="Ascensor"
              value={ascensor}
              onChange={setAscensor}
              type="select"
              options={["Sí", "No"]}
            />
            <EditSpecField
              label="Armarios"
              value={armariosEmpotrados}
              onChange={setArmariosEmpotrados}
              type="select"
              options={["Sí", "No"]}
            />
            <EditSpecField label="Terraza" value={terraza} onChange={setTerraza} />
            <EditSpecField label="Balcón" value={balcon} onChange={setBalcon} />
            <EditSpecField
              label="Gastos com."
              value={gastosComunidad}
              onChange={setGastosComunidad}
            />
            <EditSpecField
              label="Ref. catastral"
              value={referenciaCatastral}
              onChange={setReferenciaCatastral}
            />
          </div>
        </div>
      )}
    </div>
  );
}
