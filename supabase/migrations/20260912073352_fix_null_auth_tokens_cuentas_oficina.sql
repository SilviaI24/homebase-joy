-- Recuperado el 26 sep 2026 desde supabase_migrations.schema_migrations: se
-- aplicó el 12 sep por MCP sin crear el archivo local en ningún repo.
--
-- Bug conocido de GoTrue: filas de auth.users creadas por INSERT SQL directo
-- (no por la Admin API) dejan confirmation_token/recovery_token/
-- email_change_token_new/email_change en NULL en vez de ''. Cualquier
-- llamada admin que lea esa fila completa (generate_link, invite, etc.)
-- revienta con "converting NULL to string is unsupported" porque el
-- struct de Go que la escanea espera string, no NULL.
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, '')
where email in ('inmuebles@elsolgrupo.com','viviendas@elsolgrupo.com','rustica@elsolgrupo.com','gp@elsolgrupo.com');
