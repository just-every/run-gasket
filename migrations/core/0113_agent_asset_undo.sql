-- Native effect identity and before-values are retained with the asset change.
-- Compensation is a separate human act; its receipt survives a lost response.
CREATE TABLE gk_agent_asset_effects (
  effect_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  applied_revision INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  sponsor_id TEXT NOT NULL REFERENCES gk_members(id),
  idempotency_key TEXT,
  applied_at INTEGER NOT NULL,
  undone_revision INTEGER,
  undone_by TEXT REFERENCES gk_members(id),
  undone_at INTEGER,
  CHECK ((undone_revision IS NULL AND undone_by IS NULL AND undone_at IS NULL)
      OR (undone_revision = applied_revision + 1 AND undone_by IS NOT NULL AND undone_at IS NOT NULL))
);
CREATE TRIGGER gk_agent_asset_effect_immutable BEFORE UPDATE ON gk_agent_asset_effects
WHEN NEW.effect_id IS NOT OLD.effect_id OR NEW.asset_id IS NOT OLD.asset_id
  OR NEW.before_json IS NOT OLD.before_json OR NEW.after_json IS NOT OLD.after_json
  OR NEW.applied_revision IS NOT OLD.applied_revision OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.sponsor_id IS NOT OLD.sponsor_id OR NEW.idempotency_key IS NOT OLD.idempotency_key
  OR NEW.applied_at IS NOT OLD.applied_at OR OLD.undone_revision IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_agent_asset_effect_retained BEFORE DELETE ON gk_agent_asset_effects
BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
