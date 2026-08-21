-- Continuación de 20260821064713_fix_metros_y_alquiler_mismarcado.sql.
--
-- Esa migración corrigió es_alquiler correctamente, pero el trigger
-- trg_crm_preserve_closed_property_state (crm_preserve_closed_property_state())
-- bloqueó en silencio el cambio de estatus 'Vendido' -> 'Alquilado' para las
-- 592 filas afectadas: ese trigger fuerza NEW.estatus := OLD.estatus cuando
-- OLD.estatus está en ('Vendido','Alquilado'), salvo que la sesión active
-- app.crm_property_final_override = 'on' — es una protección deliberada
-- contra ediciones accidentales desde la UI de una venta ya cerrada, no un
-- bug del trigger. El resultado quedó con es_alquiler=true + estatus='Vendido'
-- todavía contradictorio, que es justo lo que esta migración corrige,
-- usando el propio mecanismo de override que el trigger ya contempla para
-- este tipo de corrección legítima de datos (no una edición de UI).

do $$
declare
  v_afectados int;
begin
  select count(*) into v_afectados
  from public.properties
  where estatus = 'Vendido' and es_alquiler = true;
  raise notice 'Filas con estatus bloqueado por el trigger a corregir: %', v_afectados;
end $$;

set local app.crm_property_final_override = 'on';

update public.properties
set estatus = 'Alquilado'
where estatus = 'Vendido' and es_alquiler = true;

do $$
declare
  v_restantes int;
begin
  select count(*) into v_restantes
  from public.properties
  where estatus = 'Vendido' and es_alquiler = true;

  if v_restantes <> 0 then
    raise exception 'Postflight falló: quedan % filas Vendido+alquiler sin corregir', v_restantes;
  end if;

  raise notice 'Postflight OK: ninguna fila queda con estatus=Vendido y es_alquiler=true.';
end $$;
