-- Conversaciones → señales en el contacto (24 sep 2026).
--
-- conversaciones.pide_llamada: el cliente pidió que le vuelvan a llamar (la
-- columna SI/NO del export de Airtable, confirmado por David). Booleano
-- propio en vez de reinterpretar solicitud_llamada, que es texto libre.
--
-- contacts.ultimo_contacto_at / contacts.pide_llamada: la Bandeja decidía
-- "Pendientes" y el orden por created_at, así que un lead antiguo que vuelve a
-- llamar pidiendo que le devuelvan la llamada quedaba enterrado en "Antiguos".
-- Se mantienen solos desde conversaciones (trigger), sin que ningún
-- importador ni automatización tenga que acordarse de actualizarlos.

ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS pide_llamada boolean;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ultimo_contacto_at timestamptz,
  ADD COLUMN IF NOT EXISTS pide_llamada boolean NOT NULL DEFAULT false;

UPDATE public.contacts SET ultimo_contacto_at = created_at WHERE ultimo_contacto_at IS NULL;

CREATE INDEX IF NOT EXISTS contacts_ultimo_contacto_at_idx ON public.contacts (ultimo_contacto_at DESC);

CREATE OR REPLACE FUNCTION public.trg_contacts_ultimo_contacto_por_defecto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.ultimo_contacto_at := COALESCE(NEW.ultimo_contacto_at, NEW.created_at, now());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS contacts_ultimo_contacto_por_defecto ON public.contacts;
CREATE TRIGGER contacts_ultimo_contacto_por_defecto
  BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contacts_ultimo_contacto_por_defecto();

-- La marca pide_llamada refleja la conversación MÁS RECIENTE del contacto
-- (comparando con sus otras conversaciones, no con created_at: en los leads
-- importados de Airtable el alta es segundos posterior a la propia llamada).
CREATE OR REPLACE FUNCTION public.trg_conversaciones_actualiza_contacto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.contact_id IS NULL OR NEW.fecha IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.contacts c
     SET pide_llamada = CASE
           WHEN NOT EXISTS (
             SELECT 1 FROM public.conversaciones o
              WHERE o.contact_id = NEW.contact_id AND o.id <> NEW.id AND o.fecha > NEW.fecha
           ) THEN COALESCE(NEW.pide_llamada, false)
           ELSE c.pide_llamada
         END,
         ultimo_contacto_at = GREATEST(COALESCE(c.ultimo_contacto_at, NEW.fecha), NEW.fecha)
   WHERE c.id = NEW.contact_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS conversaciones_actualiza_contacto ON public.conversaciones;
CREATE TRIGGER conversaciones_actualiza_contacto
  AFTER INSERT OR UPDATE OF contact_id, fecha, pide_llamada ON public.conversaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_conversaciones_actualiza_contacto();

REVOKE ALL ON FUNCTION public.trg_contacts_ultimo_contacto_por_defecto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_conversaciones_actualiza_contacto() FROM PUBLIC, anon, authenticated;
