import { describe, expect, it } from "vitest";
import { evaluarEncajeAlquiler, respuestaCorta } from "./contactos-format";

describe("evaluarEncajeAlquiler", () => {
  it("cumple con contrato o con avalista", () => {
    expect(evaluarEncajeAlquiler({ contrato: "Si", avalista: "" })).toBe("cumple");
    expect(evaluarEncajeAlquiler({ contrato: "No", avalista: "Sí, es un pensionado" })).toBe(
      "cumple",
    );
  });
  it("no cumple solo si ha dicho que no a las dos", () => {
    expect(evaluarEncajeAlquiler({ contrato: "no", avalista: "No" })).toBe("no_cumple");
  });
  it("faltan datos si alguna respuesta falta o no es clara", () => {
    expect(evaluarEncajeAlquiler({ contrato: "", avalista: "" })).toBe("faltan_datos");
    expect(evaluarEncajeAlquiler({ contrato: "No", avalista: "" })).toBe("faltan_datos");
    expect(evaluarEncajeAlquiler({ contrato: "Si6", avalista: "" })).toBe("faltan_datos");
  });
});

describe("respuestaCorta", () => {
  it("normaliza Sí/No y deja el detalle", () => {
    expect(respuestaCorta("si")).toBe("Sí");
    expect(respuestaCorta("Sí, un perro pequeño")).toBe("Sí, un perro pequeño");
    expect(respuestaCorta("no")).toBe("No");
    expect(respuestaCorta("")).toBe("—");
  });
});
