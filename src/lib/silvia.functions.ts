import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Eres SilvIA, la asistente de IA de El Sol Grupo, una inmobiliaria en Asturias, España.
Ayudas a los agentes inmobiliarios a gestionar leads, calificar clientes, hacer matching con propiedades y analizar la cartera.
Responde siempre en español. Sé concisa y útil. Si no tienes información suficiente, dilo con claridad.
No inventes datos concretos (precios, direcciones, nombres) que no estén en el contexto proporcionado.`;

export const askSilvia = createServerFn({ method: "POST" })
  .inputValidator((d: { message: string; context: string }) => {
    if (!d?.message?.trim()) throw new Error("Mensaje vacío");
    return d;
  })
  .handler(async ({ data }) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY no configurada en las variables de entorno");

    const client = new Anthropic({ apiKey: key });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `${SYSTEM_PROMPT}\n\nContexto actual del CRM:\n${data.context}`,
      messages: [{ role: "user", content: data.message }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return { reply: text };
  });
