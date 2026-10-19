-- PART-007: inventory valuation at moving-average cost, in whole US cents.
-- Every movement written from now on carries its signed value beside its
-- signed quantity, so stock value is the sum of movement values exactly as
-- on-hand is the sum of quantities. A receipt keeps its unit price, freight
-- and sales tax; a part keeps its current vendor price, which values nothing
-- by itself. Movements from before valuation (and moved-in opening stock)
-- have no value and are reported as unpriced, never as a cost.
ALTER TABLE gk_part_moves ADD COLUMN value_cents INTEGER;
ALTER TABLE gk_part_moves ADD COLUMN unit_price_cents INTEGER CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0);
ALTER TABLE gk_part_moves ADD COLUMN freight_cents INTEGER CHECK (freight_cents IS NULL OR freight_cents >= 0);
ALTER TABLE gk_part_moves ADD COLUMN tax_cents INTEGER CHECK (tax_cents IS NULL OR tax_cents >= 0);
ALTER TABLE gk_parts ADD COLUMN price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0);
