-- 14 sep 2026: reorganización de Bandeja acordada con David.
--
-- 1) trabajado traía valores sueltos del import de Airtable que el código
-- nunca interpretó: '' (3.370 filas) y 'Listo' (774 filas, confirmado por
-- David como sinónimo de 'Contactado'). Se normaliza a NULL (pendiente) |
-- Contactado | Descartado.
--
-- 2) canal_origen ya tenía una restricción desde el esquema inicial
-- (contacts_canal_origen_check, 1 jun 2026) con un vocabulario más rico del
-- que se había propuesto sin revisarla primero (fallo de esta sesión, no de
-- otra) -- incluye SilvIA-Valorador (el valorador es una función real,
-- supabase/functions/valorador/), Presencial, Referido, Manual. Nunca se
-- llegó a escribir ninguno de esos valores en producción (solo 'Web', 18
-- filas). Decisión de David: mantener ese vocabulario más amplio, quitando
-- el prefijo "SilvIA-" de los 4 que lo llevaban, y añadir 'Legado' para el
-- histórico de conversaciones sin canal identificable (mismo criterio que
-- ya usaba listConversacionesIaPage para distinguirlo de un contacto normal
-- sin relación con SilvIA).
--
-- Bandeja operativa sigue mostrando solo WhatsApp/Voz/Email/Legado -- igual
-- que ya se comportaba el código (Web nunca entraba en el filtro legado
-- porque este exige canal_origen NULL).

update public.contacts set trabajado = 'Contactado' where trabajado = 'Listo';
update public.contacts set trabajado = NULL where trabajado = '';

alter table public.contacts drop constraint contacts_canal_origen_check;

update public.contacts
set canal_origen = 'Legado'
where canal_origen is null
  and conversaciones is not null
  and conversaciones not ilike '%idealista%'
  and (motivo is null or motivo not ilike '%idealista%')
  and (solicitud is null or solicitud not ilike '%idealista%');

alter table public.contacts
  add constraint contacts_canal_origen_check
  check (canal_origen is null or canal_origen in (
    'WhatsApp', 'Voz', 'Email', 'Valorador', 'Idealista',
    'Presencial', 'Referido', 'Manual', 'Web', 'Legado'
  ));

alter table public.contacts
  add constraint contacts_trabajado_check
  check (trabajado is null or trabajado in ('Contactado', 'Descartado'));
