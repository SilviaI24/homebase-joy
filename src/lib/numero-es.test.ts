import { describe, expect, it } from "vitest";
import { numeroEsCampo, parseNumeroEs } from "./numero-es";

describe("parseNumeroEs", () => {
  it("vacío → undefined (no se toca el campo)", () => {
    expect(parseNumeroEs("")).toBeUndefined();
    expect(parseNumeroEs("   ")).toBeUndefined();
    expect(parseNumeroEs(undefined)).toBeUndefined();
    expect(parseNumeroEs(null)).toBeUndefined();
  });
  it("enteros y decimales simples", () => {
    expect(parseNumeroEs("85")).toBe(85);
    expect(parseNumeroEs("85,5")).toBe(85.5);
    expect(parseNumeroEs("2.5")).toBe(2.5);
    expect(parseNumeroEs(90)).toBe(90);
  });
  it("punto de miles español", () => {
    expect(parseNumeroEs("1.200")).toBe(1200);
    expect(parseNumeroEs("1.200.000")).toBe(1200000);
    expect(parseNumeroEs("1.200,50")).toBe(1200.5);
    expect(parseNumeroEs("1 200")).toBe(1200);
  });
  it("quita unidades", () => {
    expect(parseNumeroEs("85 m2")).toBe(85);
    expect(parseNumeroEs("85m²")).toBe(85);
    expect(parseNumeroEs("1.200 metros cuadrados")).toBe(1200);
    expect(parseNumeroEs("3 hab")).toBe(3);
    expect(parseNumeroEs("2 baños")).toBe(2);
  });
  it("texto no numérico → null", () => {
    expect(parseNumeroEs("ochenta")).toBeNull();
    expect(parseNumeroEs("85-90")).toBeNull();
    expect(parseNumeroEs("1,2,3")).toBeNull();
    expect(parseNumeroEs("1.2.3")).toBeNull();
    expect(parseNumeroEs("-5")).toBeNull();
    expect(parseNumeroEs("12.34,5,6")).toBeNull();
  });
});

describe("numeroEsCampo", () => {
  it("devuelve el número o undefined", () => {
    expect(numeroEsCampo("1.200", "Superficie")).toBe(1200);
    expect(numeroEsCampo("", "Superficie")).toBeUndefined();
  });
  it("error legible si no es número", () => {
    expect(() => numeroEsCampo("mucho", "Superficie")).toThrow(/Superficie/);
  });
  it("exige entero cuando se pide", () => {
    expect(numeroEsCampo("3", "Habitaciones", { entero: true })).toBe(3);
    expect(() => numeroEsCampo("2.5", "Habitaciones", { entero: true })).toThrow(/entero/);
    expect(() => numeroEsCampo("2,5", "Baños", { entero: true })).toThrow(/entero/);
  });
});
