import { describe, expect, it } from "vitest";
import {
  emailInvitable,
  textoEventoCliente,
  textoEventoInterno,
  ubicacionVisita,
  type DatosEventoVisita,
} from "./visita-invitacion";

const datos: DatosEventoVisita = {
  direccion: "Camino de la Maquila 175",
  zona: "Cabueñes (Gijón)",
  cp: "33394",
  localidad: "Gijón",
  clienteNombre: "María López García",
  agenteNombre: "Mayte",
  agenteEmail: "viviendas@elsolgrupo.com",
  notas: "Cliente muy interesado, negociar rebaja del 5%",
};

describe("textoEventoCliente", () => {
  it("nunca incluye las notas internas de la visita", () => {
    const t = textoEventoCliente(datos);
    expect(t.titulo).not.toContain("rebaja");
    expect(t.descripcion).not.toContain("rebaja");
  });

  it("no pone el nombre del cliente en el título (es lo que se ve en su bandeja)", () => {
    expect(textoEventoCliente(datos).titulo).toBe(
      "Visita a Camino de la Maquila 175 · El Sol Grupo",
    );
  });

  it("saluda por el primer nombre y nombra al comercial y su email", () => {
    const d = textoEventoCliente(datos).descripcion;
    expect(d.startsWith("Hola María:")).toBe(true);
    expect(d).toContain("Te atenderá Mayte, de El Sol Grupo.");
    expect(d).toContain("viviendas@elsolgrupo.com");
  });

  it("sin nombre ni agente sigue siendo un texto correcto", () => {
    const d = textoEventoCliente({
      ...datos,
      clienteNombre: "",
      agenteNombre: "",
      agenteEmail: "",
    }).descripcion;
    expect(d.startsWith("Hola:")).toBe(true);
    expect(d).not.toContain("Te atenderá");
    expect(d).toContain("responde a esta invitación y lo reorganizamos");
  });
});

describe("textoEventoInterno", () => {
  it("conserva el formato de siempre, con cliente y notas", () => {
    const t = textoEventoInterno(datos);
    expect(t.titulo).toBe("Visita: Camino de la Maquila 175 — María López García");
    expect(t.descripcion).toBe(datos.notas);
  });
});

describe("ubicacionVisita", () => {
  it("dirección + CP y localidad", () => {
    expect(ubicacionVisita(datos)).toBe("Camino de la Maquila 175, 33394 Gijón");
  });
});

describe("emailInvitable", () => {
  it("acepta emails normales y los normaliza", () => {
    expect(emailInvitable("  Maria@Gmail.com ")).toBe("maria@gmail.com");
  });
  it("rechaza vacíos y texto libre importado", () => {
    expect(emailInvitable("")).toBeNull();
    expect(emailInvitable(null)).toBeNull();
    expect(emailInvitable("no tiene")).toBeNull();
    expect(emailInvitable("a@b.com, c@d.com")).toBeNull();
  });
});
