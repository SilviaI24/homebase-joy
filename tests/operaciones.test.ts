import { describe, expect, it } from "vitest";
import {
  assertRegularOperacionTransition,
  getOperationCloseBlockers,
  toPublicCloseError,
} from "../src/lib/operaciones.functions";

describe("transiciones de operaciones", () => {
  it("obliga a usar el comando transaccional para cerrar", () => {
    expect(() => assertRegularOperacionTransition("En negociación", "Cerrada")).toThrow(
      "Cerrar operación",
    );
  });

  it("impide reabrir una operación cerrada", () => {
    expect(() => assertRegularOperacionTransition("Cerrada", "Abierta")).toThrow(
      "no puede reabrirse",
    );
  });

  it("mantiene disponibles las transiciones ordinarias", () => {
    expect(() => assertRegularOperacionTransition("Abierta", "En negociación")).not.toThrow();
    expect(() => assertRegularOperacionTransition("Cancelada", "Abierta")).not.toThrow();
  });
});

describe("preparación del cierre", () => {
  it("explica todos los datos que faltan en una venta", () => {
    expect(
      getOperationCloseBlockers({
        tipo: "Venta",
        precioOperacion: null,
        comisionPct: 3,
        propertyId: null,
        propertyStatus: null,
        propertyEsAlquiler: null,
        vendedorId: null,
        compradorId: null,
      }),
    ).toEqual([
      "Selecciona el inmueble",
      "Selecciona el propietario",
      "Selecciona el comprador",
      "Indica un precio final mayor que cero",
    ]);
  });

  it("detecta una cartera incompatible y un inmueble no disponible", () => {
    expect(
      getOperationCloseBlockers({
        tipo: "Alquiler",
        precioOperacion: 950,
        comisionPct: 3,
        propertyId: "property-1",
        propertyStatus: "Alquilado",
        propertyEsAlquiler: false,
        vendedorId: "owner-1",
        compradorId: "tenant-1",
      }),
    ).toEqual([
      "El inmueble debe estar activo o reservado",
      "El inmueble pertenece a la cartera de venta",
    ]);
  });

  it("permite cerrar una operación completa", () => {
    expect(
      getOperationCloseBlockers({
        tipo: "Venta",
        precioOperacion: 195000,
        comisionPct: 3,
        propertyId: "property-1",
        propertyStatus: "Reservado",
        propertyEsAlquiler: false,
        vendedorId: "owner-1",
        compradorId: "buyer-1",
      }),
    ).toEqual([]);
  });
});

describe("errores públicos de cierre", () => {
  it("conserva los mensajes de negocio seguros", () => {
    expect(
      toPublicCloseError("Database error: La operación necesita un comprador o inquilino").message,
    ).toBe("La operación necesita un comprador o inquilino");
  });

  it("oculta los detalles internos no reconocidos", () => {
    expect(toPublicCloseError("relation public.secret_table does not exist").message).toBe(
      "No se pudo cerrar la operación de forma segura. Revisa sus datos e inténtalo de nuevo.",
    );
  });
});
