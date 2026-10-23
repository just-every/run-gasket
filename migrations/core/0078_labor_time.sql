-- FIELD-006: time sources and reviewed cost snapshots. Rates never enter audit details.
CREATE TABLE gk_labor_rates (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES gk_members(id),
 cents_per_hour INTEGER NOT NULL CHECK(cents_per_hour>=0),
 overtime_after_minutes INTEGER NOT NULL CHECK(overtime_after_minutes>0),
 overtime_multiplier INTEGER NOT NULL CHECK(overtime_multiplier>=100),
 recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_labor_rates_keep BEFORE UPDATE ON gk_labor_rates BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_labor_rates_stay BEFORE DELETE ON gk_labor_rates BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_labor_entries (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 person_id TEXT NOT NULL REFERENCES gk_members(id), category TEXT NOT NULL CHECK(category IN ('wrench','travel','wait','admin')),
 started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL CHECK(ended_at>started_at), reason TEXT NOT NULL,
 supersedes_id TEXT REFERENCES gk_labor_entries(id), timer_id TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','superseded')),
 cents INTEGER, regular_minutes REAL, overtime_minutes REAL, rate_id TEXT REFERENCES gk_labor_rates(id),
 recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL,
 reviewed_by TEXT REFERENCES gk_members(id), reviewed_at INTEGER, review_reason TEXT
);
CREATE INDEX gk_labor_person_time ON gk_labor_entries(person_id,started_at,ended_at);
CREATE INDEX gk_labor_work ON gk_labor_entries(work_order_id,state);
CREATE UNIQUE INDEX gk_labor_one_correction ON gk_labor_entries(supersedes_id) WHERE state IN ('pending','approved');
CREATE TRIGGER gk_labor_source_keep BEFORE UPDATE ON gk_labor_entries WHEN
 NEW.id IS NOT OLD.id OR NEW.work_order_id IS NOT OLD.work_order_id OR NEW.person_id IS NOT OLD.person_id OR
 NEW.category IS NOT OLD.category OR NEW.started_at IS NOT OLD.started_at OR NEW.ended_at IS NOT OLD.ended_at OR
 NEW.reason IS NOT OLD.reason OR NEW.supersedes_id IS NOT OLD.supersedes_id OR NEW.timer_id IS NOT OLD.timer_id OR
 NEW.recorded_by IS NOT OLD.recorded_by OR NEW.recorded_at IS NOT OLD.recorded_at OR
 (OLD.state<>'pending' AND NOT (OLD.state='approved' AND NEW.state='superseded' AND NEW.cents IS OLD.cents AND NEW.rate_id IS OLD.rate_id AND NEW.reviewed_at IS OLD.reviewed_at AND NEW.reviewed_by IS OLD.reviewed_by AND NEW.review_reason IS OLD.review_reason AND NEW.regular_minutes IS OLD.regular_minutes AND NEW.overtime_minutes IS OLD.overtime_minutes))
 BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_labor_stay BEFORE DELETE ON gk_labor_entries BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_labor_timers (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL UNIQUE REFERENCES gk_members(id),
 work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id), category TEXT NOT NULL CHECK(category IN ('wrench','travel','wait','admin')),
 state TEXT NOT NULL CHECK(state IN ('running','paused')), started_at INTEGER, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE gk_contractor_invoices (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id), contractor TEXT NOT NULL,
 reference TEXT NOT NULL, minutes INTEGER NOT NULL CHECK(minutes>=0), cents INTEGER NOT NULL CHECK(cents>0), note TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL,
 UNIQUE(contractor,reference)
);
CREATE TRIGGER gk_contractor_invoices_keep BEFORE UPDATE ON gk_contractor_invoices BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_contractor_invoices_stay BEFORE DELETE ON gk_contractor_invoices BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
