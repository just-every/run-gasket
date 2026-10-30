-- Preserve existing model-unknown identities and unrestricted historical BOMs.
-- Model bounds are immutable with their BOM revision, like serial bounds.
ALTER TABLE gk_assets ADD COLUMN model TEXT;
ALTER TABLE gk_bom_lines ADD COLUMN model_from TEXT;
ALTER TABLE gk_bom_lines ADD COLUMN model_to TEXT;
ALTER TABLE gk_bom_alternates ADD COLUMN model_from TEXT;
ALTER TABLE gk_bom_alternates ADD COLUMN model_to TEXT;
