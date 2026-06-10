const GATEWAY = "https://api.airtable.com"; // Airtable REST API
export const BASE_ID = "appJHlqz7fFFjJWF1";
export const TABLES = {
  inmuebles: "tblLEsYvGZqXntJo7",
  visitas: "tblBN7MsFyKLyn1UJ",
  clientes: "tbl4N1uR3A3XMwsqZ",
  agentes: "tbl97g8BL94xdkJp9",
} as const;

// In-memory caches (por worker). Reducen llamadas a Airtable y evitan 429.
const responseCache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 60_000; // 1 min

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function airtableFetch(
  path: string,
  init?: RequestInit,
  opts: { cacheMs?: number } = {},
): Promise<unknown> {
  const airtableKey = process.env.AIRTABLE_API_KEY_1;
  if (!airtableKey) throw new Error("AIRTABLE_API_KEY_1 is not configured");

  const method = (init?.method ?? "GET").toUpperCase();
  const cacheable = method === "GET";
  const ttl = opts.cacheMs ?? DEFAULT_TTL_MS;
  const cacheKey = `${method} ${path}`;

  if (cacheable) {
    const hit = responseCache.get(cacheKey);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
  }

  const exec = async () => {
    // Hasta 4 reintentos con backoff exponencial cuando Airtable devuelve 429/5xx.
    let lastBody = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${GATEWAY}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${airtableKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (cacheable) responseCache.set(cacheKey, { at: Date.now(), data });
        return data;
      }
      lastBody = await res.text();
      if (res.status !== 429 && res.status < 500) break;
      // 429 ó 5xx: espera 1s, 2s, 4s, 8s con jitter.
      await sleep(1000 * Math.pow(2, attempt) + Math.random() * 250);
    }
    throw new Error(`Airtable: ${lastBody.slice(0, 300)}`);
  };

  if (!cacheable) return exec();

  const promise = exec().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, promise);
  return promise;
}
