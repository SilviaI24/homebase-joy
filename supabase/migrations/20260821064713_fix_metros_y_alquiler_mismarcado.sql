-- Corrige dos bugs de datos de origen (sync Airtable -> properties),
-- documentados desde el 20 ago 2026 en la Fase 1 de estadisticas_barrio
-- (ver DISENO_PORTAL_ANALITICA_PROPIETARIO_2026-08-20.md, elsol-client-hub)
-- y verificados con detalle el 21 ago 2026 antes de decidir esta corrección.
--
-- Regla aplicada: REGLA_CALIDAD_METRICAS_AGREGADAS_2026-08-20.md — cuando la
-- evidencia es ambigua no se inventa un valor "reconstruido"; se corrige
-- solo lo que tiene una única explicación plausible, y lo demás se deja en
-- NULL o sin tocar en vez de adivinar.
--
-- ═══════════════════════════════════════════════════════════════════════
-- BUG 1 — metros_construidos pierde el separador de miles en el sync
-- ═══════════════════════════════════════════════════════════════════════
-- Verificado el 21 ago 2026: los valores <20 m² son estructuralmente
-- imposibles para cualquier inmueble construido o parcela (un piso, local,
-- edificio, chalet o terreno de menos de 20 m² no existe en este mercado;
-- el propio Terreno llega hasta 18.773 m² en el resto de la tabla, lo que
-- confirma que la cola <20 es el bug, no el rango real de la categoría).
-- Garaje y Trastero son la única excepción legítima: una plaza de garaje
-- de 12-17 m² o un trastero de 3-16 m² es normal, así que para esos dos
-- tipos solo se corrige el valor 0 (un 0 m² sí es imposible incluso ahí).
--
-- No se intenta reconstruir el valor original (p. ej. multiplicar por
-- 1000) porque no hay forma de saber con certeza qué parte del número se
-- perdió -> se deja en NULL, igual que ya se hace con datos ausentes.

do $$
declare
  v_afectados int;
begin
  select count(*) into v_afectados
  from public.properties
  where metros_construidos is not null
    and (
      (tipo in ('Garaje', 'Trastero') and metros_construidos = 0)
      or (tipo is distinct from 'Garaje' and tipo is distinct from 'Trastero' and metros_construidos < 20)
    );
  raise notice 'BUG 1 (metros_construidos): % filas a corregir a NULL', v_afectados;
end $$;

update public.properties
set metros_construidos = null
where metros_construidos is not null
  and (
    (tipo in ('Garaje', 'Trastero') and metros_construidos = 0)
    or (tipo is distinct from 'Garaje' and tipo is distinct from 'Trastero' and metros_construidos < 20)
  );

-- ═══════════════════════════════════════════════════════════════════════
-- BUG 2 — alquileres mensuales guardados con es_alquiler = false
-- ═══════════════════════════════════════════════════════════════════════
-- Verificado el 21 ago 2026: ninguna venta real de inmueble en este
-- mercado (de ningún tipo, incluidos garaje y trastero) se cierra por
-- menos de ~1.000€ — y la distribución de estos precios "de venta" se
-- concentra en múltiplos de 50 típicos de renta mensual (400, 450, ..., 950
-- explican el 55-58% de los casos en Piso/Local). Es el mismo hallazgo que
-- ya motivó excluir estas filas de estadisticas_barrio, ahora corregido en
-- origen en vez de solo filtrado en cada cálculo.
--
-- Precios por debajo de 20€ (27 filas, casi todas "1" o "3") no son
-- plausibles ni como venta ni como alquiler — son placeholders de datos
-- incompletos, no rentas reales -> no se tocan, se deja la contradicción
-- como está en vez de adivinar cuál de los dos campos es el erróneo.
--
-- estatus = 'Vendido' pasa a 'Alquilado' porque afirmaba una venta
-- completada que ya no se sostiene. 'Baja' se mantiene igual: una
-- publicación retirada es válida tanto para alquiler como para venta, así
-- que no hace falta cambiarla. 'Activo'/'Reservado' igual.

do $$
declare
  v_afectados int;
begin
  select count(*) into v_afectados
  from public.properties
  where es_alquiler = false
    and precio is not null
    and precio >= 20 and precio < 990;
  raise notice 'BUG 2 (es_alquiler mal marcado): % filas a corregir', v_afectados;
end $$;

update public.properties
set es_alquiler = true,
    estatus = case when estatus = 'Vendido' then 'Alquilado' else estatus end
where es_alquiler = false
  and precio is not null
  and precio >= 20 and precio < 990;

-- Postflight: confirma que ya no queda ninguna fila en ninguno de los dos
-- estados contradictorios (salvo el carve-out documentado de <20€).
do $$
declare
  v_restantes_bug1 int;
  v_restantes_bug2 int;
begin
  select count(*) into v_restantes_bug1
  from public.properties
  where metros_construidos is not null
    and (
      (tipo in ('Garaje', 'Trastero') and metros_construidos = 0)
      or (tipo is distinct from 'Garaje' and tipo is distinct from 'Trastero' and metros_construidos < 20)
    );

  select count(*) into v_restantes_bug2
  from public.properties
  where es_alquiler = false
    and precio is not null
    and precio >= 20 and precio < 990;

  if v_restantes_bug1 <> 0 then
    raise exception 'Postflight BUG 1 falló: quedan % filas sin corregir', v_restantes_bug1;
  end if;
  if v_restantes_bug2 <> 0 then
    raise exception 'Postflight BUG 2 falló: quedan % filas sin corregir', v_restantes_bug2;
  end if;

  raise notice 'Postflight OK: ambos bugs corregidos, sin filas contradictorias restantes (excepto el carve-out documentado de precio<20€).';
end $$;
