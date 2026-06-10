Propuesta de implementación por bloques. Es un cambio extenso (afecta dashboard, listado, detalle y alta de inmuebles), así que lo divido en fases verificables. Confírmame el alcance y voy fase a fase.

## Fase 1 — Dashboard: sección de "Inmuebles estancados"
- En `src/routes/index.tsx`, añadir al final una sección informativa "Inmuebles estancados (>90 días)" reutilizando `RecordatoriosEstancados` con los inmuebles ya cargados.
- Sólo lectura, no filtra el resto del dashboard ni la vista individual.

## Fase 2 — Listado de inmuebles: filtro por agente asignado
- En `src/routes/inmuebles.index.tsx`, añadir un `<select>` "Agente" junto a Estatus, alimentado por `i.agentesNombres` (unión de todos los nombres presentes en la lista).
- Aplicar el filtro a `filtered` y `kanbanGroups` (incluye opción "Todos" y "Sin asignar").

## Fase 3 — Detalle de inmueble: todos los campos editables + reordenar fotos
- Hacer editable la `descripción` (ya hay otros campos editables) con `Textarea` + `updateInmueble` (añadir `descripcion` al payload).
- Reordenar imágenes por drag & drop usando HTML5 nativo (sin deps): UI de miniaturas con `draggable`, se reordena el array local y se persiste con un nuevo campo `imagenesOrden` enviado a Airtable como reordenación del attachment array (PATCH `Imágenes` con los attachments en el nuevo orden, manteniendo `id`/`url`).
- Nota técnica: Airtable conserva el orden enviado en attachments; necesitamos guardar los attachments completos (id + url) en `InmuebleDetalle`, no sólo URLs.

## Fase 4 — Alta de inmueble por tipo (formularios específicos)
- Refactor de `NewInmuebleDialog` en un wizard de 2 pasos:
  1. Selector de **Tipo de inmueble** (Piso, Chalet, Garaje, Trastero, Local, Terreno, Nave, Otros, Alquiler de Piso, Alquiler de Garaje, Alquiler de Oficina). Lista mantenida en un `TIPO_INMUEBLE` central; los valores deben coincidir con la opción de Airtable.
  2. Formulario específico con los campos listados en tu mensaje para cada tipo (Chalet, Terreno, Piso, Garaje, Local, Trastero). Para tipos sin spec explícita (Nave, Otros, Alquileres) uso el formulario base actual.
- Cada formulario incluye al final el bloque **Propietario**: botón "+ Añadir cliente" (abre diálogo de creación de cliente o selecciona uno existente), `Fecha de inicio` y `Fecha de autorización de venta (exclusiva)` con date picker `dd/mm/yyyy`.
- Subida de imágenes y documentación a Airtable (PATCH con URLs ya subidas — Airtable requiere URL pública). Si todavía no hay storage configurado, dejaré el campo como "pega URL" como hace el código actual y lo señalo.

## Fase 5 — Bloque "Propietario" reutilizable en todos los forms
- Componente `PropietarioBlock` con: combobox de clientes existentes + botón "+ Añadir cliente" (reusa `NewClienteDialog` si existe), dos date pickers (`shadcn` Calendar + Popover, formato `dd/mm/yyyy`).
- Se enlaza al inmueble en la creación vía `Propietario` (link a tabla `clientes`) y guarda las fechas en `Fecha de inicio` y `Fecha de autorización de venta ( exclusiva)`.

## Notas / riesgos
- Los nombres exactos de campo en Airtable los tomaré tal como aparecen en `inmuebles.functions.ts` (algunos tienen espacios o tildes, ej. `"Precio Final "`, `"Fecha de autorización de venta ( exclusiva)"`). Cualquier desajuste con la base provoca error 422.
- Los dropdowns con opciones libres en Airtable (`Orientación`, `Estado`, etc.) requieren typecast en el PATCH si quieres permitir nuevos valores; lo activo sólo donde la spec lo pide ("Orientación + option").
- Carga de archivos: si quieres subida real (no por URL), hay que activar Lovable Cloud y un bucket de Storage. Decísmelo antes de Fase 4.

## Preguntas antes de empezar
1. ¿Lo hago en este orden (1→5) en commits separados, o prefieres todo en un único cambio? 
2. Subida de imágenes/documentación: ¿activamos Lovable Cloud Storage o mantenemos por URL?
3. ¿"+ Añadir cliente" debe **crear** un cliente nuevo en Airtable, o sólo **seleccionar** de los existentes (o ambos)?
