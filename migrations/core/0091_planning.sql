-- Explicit site-clock windows; no assumed eight-hour day or implicit capacity.
CREATE TABLE gk_planning_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL);
INSERT INTO gk_planning_state VALUES(1,1);
CREATE TABLE gk_qualifications (
 member_id TEXT NOT NULL REFERENCES gk_members(id), name TEXT NOT NULL COLLATE NOCASE,
 expires_on TEXT NOT NULL, reference TEXT NOT NULL, PRIMARY KEY(member_id,name)
);
CREATE TABLE gk_planning_tools (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, identifier TEXT NOT NULL,
 calibration_due TEXT NOT NULL
);
CREATE TABLE gk_planning_windows (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES gk_members(id),
 starts TEXT NOT NULL, ends TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('available','absent')),
 reason TEXT NOT NULL, CHECK(starts < ends)
);
CREATE TABLE gk_work_requirements (
 work_order_id TEXT PRIMARY KEY REFERENCES gk_work_orders(id), qualifications TEXT NOT NULL
);
CREATE TABLE gk_planning_slots (
 work_order_id TEXT PRIMARY KEY REFERENCES gk_work_orders(id), member_id TEXT NOT NULL REFERENCES gk_members(id),
 starts TEXT NOT NULL, ends TEXT NOT NULL, CHECK(starts < ends)
);
CREATE TABLE gk_planning_bookings (
 work_order_id TEXT NOT NULL REFERENCES gk_planning_slots(work_order_id) ON DELETE CASCADE,
 tool_id TEXT NOT NULL REFERENCES gk_planning_tools(id), PRIMARY KEY(work_order_id,tool_id)
);
CREATE INDEX gk_planning_slots_time ON gk_planning_slots(starts,ends);
-- Changing an assignee through another public door must not leave a misleading booking.
CREATE TRIGGER gk_planning_assignment AFTER UPDATE OF assignee_id ON gk_work_orders
WHEN OLD.assignee_id IS NOT NEW.assignee_id
BEGIN
 DELETE FROM gk_planning_bookings WHERE work_order_id=OLD.id;
 DELETE FROM gk_planning_slots WHERE work_order_id=OLD.id;
 UPDATE gk_planning_state SET revision=revision+1 WHERE singleton=1;
END;
