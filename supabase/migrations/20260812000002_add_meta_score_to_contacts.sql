-- meta_score: puntuación de cualificación de SilvIA (0.0–1.0)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS meta_score FLOAT CHECK (meta_score IS NULL OR (meta_score >= 0.0 AND meta_score <= 1.0));

CREATE INDEX IF NOT EXISTS idx_contacts_meta_score
  ON public.contacts (meta_score DESC NULLS LAST)
  WHERE meta_score IS NOT NULL;

COMMENT ON COLUMN public.contacts.meta_score IS
  'Score de cualificación calculado por SilvIA Meta (0.0 = frío, 1.0 = muy cualificado).';
