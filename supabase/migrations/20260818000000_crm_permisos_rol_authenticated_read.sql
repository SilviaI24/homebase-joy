-- Allow authenticated users to read role permission presets.
-- crm_usuarios and crm_permisos_usuario already have self-read policies;
-- crm_permisos_rol needs authenticated access so the app can build
-- the nav capability set using the anon-key client (no service role needed).
CREATE POLICY "crm_rol_lee_presets"
ON crm_permisos_rol
FOR SELECT
TO authenticated
USING (true);
