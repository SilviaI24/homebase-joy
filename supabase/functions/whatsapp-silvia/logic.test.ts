import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  aFormatoWhatsApp,
  esPeticionDeBaja,
  extraerMensajes,
  firmaMetaValida,
  llamadasAHerramientas,
  sigueAbierta,
  textoDeRespuesta,
} from "./logic.ts";

const SECRET = "secreto-de-prueba";
const firmar = (body: string) =>
  "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");

describe("firmaMetaValida", () => {
  const body = JSON.stringify({ entry: [] });

  it("acepta la firma correcta del cuerpo exacto", async () => {
    expect(await firmaMetaValida(body, firmar(body), SECRET)).toBe(true);
  });

  it("rechaza cuerpo alterado, firma ausente o secreto vacío", async () => {
    expect(await firmaMetaValida(body + " ", firmar(body), SECRET)).toBe(false);
    expect(await firmaMetaValida(body, null, SECRET)).toBe(false);
    expect(await firmaMetaValida(body, "sha1=abc", SECRET)).toBe(false);
    expect(await firmaMetaValida(body, firmar(body), "")).toBe(false);
  });
});

describe("extraerMensajes", () => {
  it("lee texto, botón y respuesta interactiva, e ignora estados", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PN1" },
                contacts: [{ wa_id: "34600111222", profile: { name: "  Ana " } }],
                messages: [
                  {
                    id: "w1",
                    from: "34600111222",
                    timestamp: "1790000000",
                    type: "text",
                    text: { body: " Hola " },
                  },
                  { id: "w2", from: "34600111222", type: "button", button: { text: "Sí" } },
                  {
                    id: "w3",
                    from: "34600111222",
                    type: "interactive",
                    interactive: { button_reply: { title: "Visita" } },
                  },
                  { id: "w4", from: "34600111222", type: "audio" },
                ],
              },
            },
            { value: { statuses: [{ id: "s1", status: "read" }] } },
          ],
        },
      ],
    };
    const m = extraerMensajes(payload);
    expect(m.map((x) => [x.wamid, x.texto, x.tipo])).toEqual([
      ["w1", "Hola", "text"],
      ["w2", "Sí", "button"],
      ["w3", "Visita", "interactive"],
      ["w4", null, "audio"],
    ]);
    expect(m[0].nombrePerfil).toBe("Ana");
    expect(m[0].phoneNumberId).toBe("PN1");
    expect(m[0].timestamp.toISOString()).toBe(new Date(1790000000 * 1000).toISOString());
  });

  it("tolera cargas vacías o mal formadas", () => {
    expect(extraerMensajes(null)).toEqual([]);
    expect(extraerMensajes({ entry: [{ changes: [{}] }] })).toEqual([]);
  });
});

describe("esPeticionDeBaja", () => {
  it.each([
    "BAJA",
    "Baja.",
    "stop",
    "Quiero darme de baja",
    "no me escribáis más",
    "no quiero recibir mensajes",
  ])("detecta baja: %s", (t) => expect(esPeticionDeBaja(t)).toBe(true));
  it.each([
    "no me interesa ese piso",
    "¿el bajo está disponible?",
    "planta baja con jardín",
    "",
    null,
  ])("no confunde con baja: %s", (t) => expect(esPeticionDeBaja(t)).toBe(false));
});

describe("sigueAbierta", () => {
  const ahora = new Date("2026-09-24T12:00:00Z");
  it("abre conversación nueva pasadas 24 h", () => {
    expect(sigueAbierta("2026-09-24T01:00:00Z", ahora)).toBe(true);
    expect(sigueAbierta("2026-09-23T11:59:00Z", ahora)).toBe(false);
    expect(sigueAbierta(null, ahora)).toBe(false);
  });
});

describe("respuesta de OpenAI", () => {
  it("extrae el texto final y las llamadas a herramientas", () => {
    const r = {
      output: [
        {
          type: "function_call",
          call_id: "c1",
          name: "buscar_inmueble",
          arguments: '{"texto":"Fuerte Viejo"}',
        },
        {
          type: "function_call",
          call_id: "c2",
          name: "registrar_datos_lead",
          arguments: "no-json",
        },
        {
          type: "message",
          content: [
            { type: "output_text", text: " Hola, " },
            { type: "output_text", text: "¿en qué te ayudo?" },
          ],
        },
      ],
    };
    expect(textoDeRespuesta(r)).toBe("Hola,\n\n¿en qué te ayudo?");
    expect(llamadasAHerramientas(r)).toEqual([
      { callId: "c1", nombre: "buscar_inmueble", args: { texto: "Fuerte Viejo" } },
      { callId: "c2", nombre: "registrar_datos_lead", args: {} },
    ]);
  });
});

describe("aFormatoWhatsApp", () => {
  it("convierte Markdown al formato de WhatsApp", () => {
    expect(aFormatoWhatsApp("Precio: **239.000 €**")).toBe("Precio: *239.000 €*");
    expect(aFormatoWhatsApp("## Ficha\nVer [la ficha](https://elsolgrupo.com/x)")).toBe(
      "Ficha\nVer la ficha: https://elsolgrupo.com/x",
    );
    expect(aFormatoWhatsApp("Disponible【4:0†fuente】.")).toBe("Disponible.");
  });
});
