-- H-06: contacts.meta_score llevaba marcada obsoleta desde el 21 ago 2026
-- (COMMENT en 20260821073707_mark_meta_score_obsoleta.sql) -- nadie la
-- escribe ni la lee desde entonces (verificado de nuevo el 9 sep 2026: sin
-- consumidores en el código de la app, solo referenciada en migraciones
-- históricas y en los tipos TS generados de elsol-client-hub). Decisión de
-- David: borrar. DROP COLUMN se lleva consigo el índice parcial
-- idx_contacts_meta_score (no hay vistas que dependan de la columna).
ALTER TABLE public.contacts DROP COLUMN IF EXISTS meta_score;
