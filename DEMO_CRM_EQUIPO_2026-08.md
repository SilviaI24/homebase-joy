# Demo CRM El Sol Grupo — guion operativo

## Objetivo

Demostrar que el CRM permite consultar y escribir datos de forma rápida, clara y
segura desde la entrada de un contacto hasta el seguimiento de una operación.
SilvIA se presenta como bandeja de conversaciones; las automatizaciones avanzadas
quedan fuera del alcance de esta demo.

Duración recomendada: 12–15 minutos.

## Reglas antes de empezar

- Ejecutar la demo únicamente contra la branch QA `rbac-p0`.
- Confirmar en pantalla que el usuario es `admin` y que aparece “Conectado”.
- No usar `.env.local` para scripts: actualmente apunta a ESGI producción.
- Tener dos usuarios disponibles: administrador y agente.
- No aplicar migraciones ni activar crons durante la presentación.
- Si la migración de cierre no está aprobada, terminar la operación en
  `En negociación`; no simular el cierre.

## Datos mínimos preparados

- Una conversación pendiente procedente de Idealista por voz o email.
- Una conversación pendiente recibida por WhatsApp.
- Un contacto propietario/arrendador.
- Un comprador o inquilino distinto.
- Un inmueble de venta `Activo` o `Reservado`.
- Un inmueble de alquiler `Activo` o `Reservado`.
- Un agente vinculado a `auth.users` y activo en `crm_usuarios`.

Canal y procedencia son dimensiones diferentes. Ejemplo:

- Canal: `Email` · Procedencia: `Idealista`.
- Canal: `Voz` · Procedencia: `Idealista`.
- Canal: `WhatsApp` · Procedencia: `Web El Sol`.

## Recorrido principal

### 1. Bandeja de conversaciones

1. Abrir SilvIA.
2. Filtrar por pendientes.
3. Mostrar canal y procedencia como etiquetas independientes.
4. Abrir una transcripción sin abandonar la bandeja.
5. Asignar la conversación al agente de la demo.
6. Cualificar el contacto.

Mensaje de negocio: ninguna conversación se pierde cuando el contacto cambia de
etapa.

### 2. Contacto y seguimiento

1. Localizar el contacto por nombre o teléfono.
2. Mostrar sus datos, necesidad, agente y relaciones inmobiliarias.
3. Añadir una nota de seguimiento.
4. Comprobar que aparece inmediatamente en Seguimiento con fecha y agente.

Mensaje de negocio: el equipo comparte información y sabe quién realizó cada
acción.

### 3. Cartera

1. Buscar un inmueble por referencia o dirección.
2. Mostrar estado, publicación, agente y propietario.
3. Cambiar entre Venta, Alquiler y Prospección.
4. Abrir la ficha y relacionar el contacto cuando corresponda.

Mensaje de negocio: venta y alquiler comparten una experiencia coherente, pero
mantienen sus roles correctos —Propietario/Comprador y Arrendador/Inquilino—.

### 4. Visita y trabajo diario

1. Programar una visita con inmueble, contacto, agente y fecha.
2. Cambiarla de `Programada` a `Realizada`.
3. Registrar el resultado o una nota posterior.
4. Mostrar la acción en Seguimiento.

Mensaje de negocio: Gestión funciona como agenda operativa, no solo como archivo.

### 5. Operación

1. Crear una operación de venta o alquiler.
2. Seleccionar inmueble, agente y ambas partes.
3. Indicar precio final y comisión.
4. Pasar a `En negociación`.
5. Abrir la acción de cierre.

Si falta algún dato, enseñar la lista de bloqueos del CRM. Si la RPC está aprobada
y validada en la branch, confirmar el cierre y comprobar:

- Operación `Cerrada` e inmutable.
- Inmueble `Vendido` o `Alquilado` y no publicado.
- Roles del pipeline cerrados.
- Contactos actualizados sin perder otros procesos abiertos.
- Entradas de seguimiento y auditoría creadas.

Mensaje de negocio: el cierre es una única acción transaccional; no deja estados
parciales.

### 6. Permisos

1. Entrar como agente.
2. Comprobar que solo aparecen funciones permitidas.
3. Volver como administrador.
4. Mostrar una excepción `ALLOW/DENY/Heredar` sin modificarla durante la demo.

Mensaje de negocio: todos comparten el equipo, pero cada función sensible puede
activarse o desactivarse por persona.

## Plan de contingencia

- Si falla una consulta: refrescar una vez y continuar con otra ficha preparada.
- Si falla una escritura: no repetir varias veces; conservar el mensaje de error y
  usar el segundo registro QA.
- Si el cierre atómico no está desplegado: mantener la operación en negociación.
- Si WhatsApp no permite responder: mostrar lectura/asignación y explicar que el
  envío depende del proveedor externo.
- No cambiar a producción para “rescatar” la demo.

## Criterio de demo lista

- Los seis recorridos se completan dos veces seguidas en la branch.
- No aparecen errores internos de Supabase en pantalla.
- Ninguna pantalla principal tarda más de tres segundos con caché caliente.
- No hay tarjetas o listados masivos que obliguen a desplazamientos innecesarios.
- Canal y procedencia se muestran correctamente, especialmente para Idealista.
- TypeScript, tests y build conjunto están en verde tras integrar el trabajo
  paralelo.
