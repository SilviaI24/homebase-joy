-- Run this in Supabase SQL Editor → https://supabase.com/dashboard/project/fyrfkbcabmitbfuqeccq/editor
-- Adds operational/detail fields to the properties table that weren't in the initial schema.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS publicacion            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estado                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fecha_inicio           DATE,
  ADD COLUMN IF NOT EXISTS fecha_reserva          DATE,
  ADD COLUMN IF NOT EXISTS fecha_escritura        DATE,
  ADD COLUMN IF NOT EXISTS fecha_exclusiva        DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin_exclusiva    DATE,
  ADD COLUMN IF NOT EXISTS certificacion_energetica TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ano_construccion       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gastos_comunidad       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS calefaccion            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS garaje                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trastero               TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ascensor               TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS armarios_empotrados    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terraza                TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS balcon                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referencia_catastral   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS honorarios             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_exclusiva         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notaria                TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS llaves                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observaciones          TEXT NOT NULL DEFAULT '';
