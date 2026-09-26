// Texto del evento de Google Calendar de una visita. Dos variantes:
//
// - Interna (sin cliente invitado): la de siempre, "Visita: dirección —
//   cliente" + las notas internas. Solo la ve el comercial en su calendario.
// - Para el cliente (cliente invitado, 23 sep 2026): Google le envía por
//   email EXACTAMENTE el título, la ubicación y la descripción del evento
//   -- los mismos que ve el comercial, un evento no tiene una versión por
//   invitado. Por eso aquí NUNCA entran las notas internas de la visita ni
//   el nombre del cliente en el título: todo lo que se escriba acaba en su
//   bandeja de entrada.
//
// Funciones puras (sin Supabase ni Google) para poder probarlas y para
// que la vista previa del correo use exactamente el mismo texto.

export type DatosEventoVisita = {
  direccion: string; // "Camino de la Maquila 175"
  zona: string; // "Cabueñes (Gijón)" o "" si no hay datos
  cp: string;
  localidad: string;
  clienteNombre: string;
  agenteNombre: string;
  agenteEmail: string;
  notas: string | null;
};

export function ubicacionVisita(d: DatosEventoVisita): string {
  const cpLocalidad = [d.cp, d.localidad].filter(Boolean).join(" ");
  return [d.direccion, cpLocalidad].filter(Boolean).join(", ");
}

export function textoEventoInterno(d: DatosEventoVisita) {
  return {
    titulo: `Visita: ${d.direccion}${d.clienteNombre ? ` — ${d.clienteNombre}` : ""}`,
    descripcion: d.notas ?? undefined,
  };
}

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

export function textoEventoCliente(d: DatosEventoVisita) {
  const saludo = primerNombre(d.clienteNombre);
  const lugar = d.zona ? `${d.direccion}, ${d.zona}` : d.direccion;
  const atiende = d.agenteNombre ? `Te atenderá ${d.agenteNombre}, de El Sol Grupo.` : "";
  const contacto = d.agenteEmail
    ? `responde a esta invitación o escríbenos a ${d.agenteEmail}`
    : "responde a esta invitación";

  return {
    titulo: `Visita a ${d.direccion} · El Sol Grupo`,
    descripcion: [
      saludo ? `Hola ${saludo}:` : "Hola:",
      "",
      `Te confirmamos tu visita al inmueble de ${lugar}. ${atiende}`.trim(),
      "",
      `Si no puedes venir o necesitas cambiar la hora, ${contacto} y lo reorganizamos.`,
      "",
      "Un saludo,",
      "El Sol Grupo",
    ].join("\n"),
  };
}

// Email razonable para invitar -- evita mandar a Google un valor basura de
// la ficha (hay emails de texto libre importados de Airtable).
export function emailInvitable(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(e) ? e : null;
}
