const GATEWAY = "https://connector-gateway.lovable.dev/airtable";
export const BASE_ID = "appJHlqz7fFFjJWF1";
export const TABLES = {
  inmuebles: "tblLEsYvGZqXntJo7",
  visitas: "tblBN7MsFyKLyn1UJ",
  clientes: "tbl4N1uR3A3XMwsqZ",
  agentes: "tbl97g8BL94xdkJp9",
} as const;

export async function airtableFetch(path: string, init?: RequestInit) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const airtableKey = process.env.AIRTABLE_API_KEY_1;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!airtableKey) throw new Error("AIRTABLE_API_KEY_1 is not configured");

  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": airtableKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}
