-- Auditoría de entrega (25 sep 2026) — Portal del propietario.
--
-- Hasta hoy nadie lo había notado porque la única cuenta de propietario de
-- prueba es un usuario staff (es_staff_crm() = true), que se salta todas estas
-- restricciones. Con un propietario real:
--
-- 1. No veía su inmueble: el Portal leía de properties_public, que desde
--    20260923120424 solo devuelve Activo + PUBLICADO (es la vista de la web).
--    Un inmueble en captación, reservado o sin publicar desaparecía, y sin
--    inmueble no se puede subir documentación ni firmar.
--    → Vista propia del Portal, portal_properties (security_invoker: aplica
--      la RLS de properties — "propietario ve sus properties" / staff).
--
-- 2. Onboarding, perfil y valoración de visitas no guardaban (0 filas, sin
--    error): propietarios y visits no tienen policy UPDATE para el propietario.
--    → RPC SECURITY DEFINER atadas a auth.uid(), con las transiciones
--      permitidas escritas aquí en vez de abrir UPDATE sobre toda la fila
--      (una policy UPDATE dejaría al propietario ponerse 'activo' a sí mismo o
--      cambiar su DNI, que va al contrato).
--
-- 3. visits.notas (anotaciones internas, con nombres de otros clientes) era
--    legible por el propietario → privilegio de columna.
--
-- 4. documentos: el propietario podía insertar un documento ya 'aprobado' o
--    con subido_por de otro usuario, y leer los marcados
--    visible_para_propietario = false.
--
-- 5. Dos policies TO public llamaban a es_staff_crm(), que anon no puede
--    ejecutar: cualquier lectura anónima de properties (incluida la policy
--    anon_read_published) fallaba con "permission denied for function".

-- ── 1. Inmuebles del Portal ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.portal_properties
WITH (security_invoker = true) AS
SELECT
  id,
  airtable_id AS airtable_record_id,
  ref AS ref_code,
  concat(tipo, ' ', categoria) AS title,
  concat(calle, ' ', numero,
    CASE WHEN piso <> ''::text THEN ' '::text || piso ELSE ''::text END) AS address,
  localidad AS city,
  barrio AS neighborhood,
  CASE estatus
    WHEN 'Activo'      THEN 'ACTIVE'
    WHEN 'Reservado'   THEN 'RESERVED'
    WHEN 'Prospección' THEN 'PROSPECTING'
    WHEN 'Vendido'     THEN 'SOLD'
    WHEN 'Alquilado'   THEN 'RENTED'
    ELSE 'INACTIVE'
  END AS status,
  precio AS price,
  metros_construidos,
  NULL::text AS owner_email,
  fecha_fin_exclusiva AS exclusivity_end,
  created_at,
  updated_at,
  precio_final,
  habitaciones,
  banos,
  tipo,
  imagenes,
  es_alquiler
FROM public.properties;

REVOKE ALL ON public.portal_properties FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_properties TO authenticated, service_role;

COMMENT ON VIEW public.portal_properties IS
  'Inmuebles para el Portal del propietario (sin filtro de publicación; la RLS de properties limita a los suyos). properties_public es la de la web.';

-- properties_public es de solo lectura: fuera los permisos de escritura que
-- Supabase concede por defecto (la RLS ya los bloqueaba, pero no hacen falta).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.properties_public FROM anon, authenticated;

-- ── 5. Policies TO public que llamaban a es_staff_crm() ───────────────────
ALTER POLICY "staff ve properties" ON public.properties TO authenticated;
ALTER POLICY "staff gestiona documentos" ON storage.objects TO authenticated;

-- ── 2. Escrituras del propietario vía RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.propietario_avanzar_onboarding(p_estado text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actual text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('en_proceso', 'en_revision') THEN
    RAISE EXCEPTION 'Estado no permitido para el propietario: %', p_estado;
  END IF;

  SELECT id, estado_onboarding INTO v_id, v_actual
  FROM propietarios WHERE user_id = auth.uid() AND activo
  ORDER BY created_at LIMIT 1
  FOR UPDATE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No hay ficha de propietario para este usuario' USING ERRCODE = '42501';
  END IF;

  -- Solo hacia delante y nunca a 'activo' (eso lo decide la oficina desde el CRM).
  IF v_actual = 'activo'
     OR (p_estado = 'en_proceso' AND v_actual <> 'pendiente')
     OR (p_estado = 'en_revision' AND v_actual = 'en_revision') THEN
    RETURN v_actual;
  END IF;

  UPDATE propietarios SET estado_onboarding = p_estado, updated_at = now()
  WHERE id = v_id;
  RETURN p_estado;
END;
$$;

CREATE OR REPLACE FUNCTION public.propietario_guardar_casos_especiales(p_casos text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_casos, '{}')) c
             WHERE c NOT IN ('herencia', 'divorcio', 'menores')) THEN
    RAISE EXCEPTION 'Caso especial no válido';
  END IF;

  UPDATE propietarios
  SET casos_especiales = coalesce(ARRAY(SELECT DISTINCT unnest(p_casos)), '{}'),
      updated_at = now()
  WHERE user_id = auth.uid() AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay ficha de propietario para este usuario' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.propietario_actualizar_perfil(p_nombre text, p_telefono text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;

  UPDATE propietarios
  SET nombre = btrim(p_nombre),
      telefono = nullif(btrim(p_telefono), ''),
      updated_at = now()
  WHERE user_id = auth.uid() AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay ficha de propietario para este usuario' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.propietario_valorar_visita(p_visit_id uuid, p_puntuacion int, p_texto text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_puntuacion IS NULL OR p_puntuacion NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'La puntuación debe estar entre 1 y 5';
  END IF;

  -- Mismo criterio que la pantalla: visita Realizada, de un inmueble suyo, sin
  -- valorar todavía (una valoración no se reescribe).
  UPDATE visits v
  SET feedback_puntuacion = p_puntuacion,
      feedback_texto = coalesce(left(btrim(p_texto), 2000), '')
  WHERE v.id = p_visit_id
    AND v.estado = 'Realizada'
    AND v.feedback_puntuacion IS NULL
    AND v.property_id IN (
      SELECT pi.property_id
      FROM propietario_inmueble pi
      JOIN propietarios p ON p.id = pi.propietario_id
      WHERE p.user_id = auth.uid()
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se puede valorar esta visita';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.propietario_avanzar_onboarding(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.propietario_guardar_casos_especiales(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.propietario_actualizar_perfil(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.propietario_valorar_visita(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propietario_avanzar_onboarding(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propietario_guardar_casos_especiales(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propietario_actualizar_perfil(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propietario_valorar_visita(uuid, int, text) TO authenticated;

-- ── 3. visits.notas fuera del alcance del Portal ──────────────────────────
-- El CRM usa service_role (no afectado). En el Portal nadie más que el
-- propietario lee visits, y ninguna consulta pide '*'.
REVOKE SELECT ON public.visits FROM anon, authenticated;
GRANT SELECT (id, property_id, contact_id, agente_id, fecha, duracion_minutos,
              estado, airtable_id, created_at, tipo, feedback_puntuacion,
              feedback_texto, resultado, google_event_id)
  ON public.visits TO authenticated;

-- La policy de lectura del propietario era TO public; con la anon key no
-- tiene sentido (auth.uid() es NULL).
ALTER POLICY "propietario ve sus visits" ON public.visits TO authenticated;

-- ── 4. documentos ──────────────────────────────────────────────────────────
ALTER POLICY "propietario sube documentos" ON public.documentos
  WITH CHECK (
    subido_por = auth.uid()
    AND estado IN ('pendiente', 'revision')
    AND property_id IN (
      SELECT pi.property_id
      FROM propietario_inmueble pi
      JOIN propietarios p ON p.id = pi.propietario_id
      WHERE p.user_id = auth.uid()
    )
  );

ALTER POLICY "propietario ve documentos de sus inmuebles" ON public.documentos
  USING (
    subido_por = auth.uid()
    OR (
      visible_para_propietario IS TRUE
      AND property_id IN (
        SELECT pi.property_id
        FROM propietario_inmueble pi
        JOIN propietarios p ON p.id = pi.propietario_id
        WHERE p.user_id = auth.uid()
      )
    )
  );
