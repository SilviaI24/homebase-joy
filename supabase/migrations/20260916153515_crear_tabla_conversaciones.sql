-- Tabla `conversaciones`: fuente normalizada del historial de conversaciones
-- (WhatsApp/Voz/Email) que hoy solo existe en la base "Conversaciones" de
-- Airtable. Es la pieza que faltaba: relación uno-a-muchos con contacts
-- (un contacto puede tener varias conversaciones a lo largo del tiempo),
-- separada de los campos aplanados de contacts (motivo, solicitud,
-- conversaciones, canal_origen), que hasta ahora eran el único destino
-- importado y solo guardan el último resumen, no el histórico real.
--
-- Decidido el 16 sep 2026: la escriben exclusivamente las automatizaciones
-- (Make/Codex) vía service_role — de ahí una sola policy. Si en el futuro
-- el CRM necesita crear/editar conversaciones a mano, añadir entonces una
-- policy adicional para `authenticated`, igual que en contacts.
--
-- No se toca contacts en esta migración (ni sus campos, ni la bandeja de
-- conversaciones IA, que hoy sigue leyendo de ahí) — es un rediseño aparte,
-- pendiente de que esta tabla lleve datos reales.
create table public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  -- Mismos valores que contacts.canal_origen (BANDEJA_CANALES en
  -- clientes-conversaciones.functions.ts), para poder cruzar ambas sin
  -- normalizar mayúsculas.
  canal text not null check (canal in ('WhatsApp', 'Voz', 'Email')),
  telefono text,
  nombre text,
  fecha timestamptz,
  transcripcion text,
  resumen_anterior text,
  resumen text,
  seccion text,
  solicitud_llamada text,
  motivo_llamada text,
  ai_thread_id text,
  external_conversation_id text,
  -- Estado del propio pipeline de ingesta/procesamiento de la
  -- automatización, no del triage humano del lead (eso sigue viviendo en
  -- contacts.trabajado). Placeholder inicial — ampliar con una migración
  -- futura si la automatización necesita más estados.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'procesado', 'error')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversaciones_contact_id_idx on public.conversaciones(contact_id);
create index conversaciones_pendientes_idx on public.conversaciones(estado, fecha);

alter table public.conversaciones enable row level security;

create policy service_role_all on public.conversaciones
  for all to service_role using (true) with check (true);

create trigger trg_conversaciones_updated_at
  before update on public.conversaciones
  for each row execute function update_updated_at();
