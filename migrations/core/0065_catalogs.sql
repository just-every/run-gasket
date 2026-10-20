-- PART-008: supplier packs refer to stocking units; prices remain per pack.
ALTER TABLE gk_supplier_items ADD COLUMN part_id TEXT REFERENCES gk_parts(id);
ALTER TABLE gk_supplier_items ADD COLUMN manufacturer TEXT NOT NULL DEFAULT '';
ALTER TABLE gk_supplier_items ADD COLUMN manufacturer_number TEXT NOT NULL DEFAULT '';
ALTER TABLE gk_supplier_items ADD COLUMN pack_milli INTEGER NOT NULL DEFAULT 1000 CHECK(pack_milli > 0);
ALTER TABLE gk_supplier_items ADD COLUMN preferred INTEGER NOT NULL DEFAULT 0 CHECK(preferred IN (0,1));
CREATE UNIQUE INDEX gk_supplier_item_preferred ON gk_supplier_items(part_id) WHERE preferred=1 AND part_id IS NOT NULL;
CREATE TABLE gk_part_aliases (
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  kind TEXT NOT NULL CHECK(kind IN ('part','manufacturer','vendor')),
  number TEXT NOT NULL COLLATE NOCASE,
  supplier_id TEXT REFERENCES gk_suppliers(id)
);
CREATE UNIQUE INDEX gk_part_alias_identity ON gk_part_aliases(part_id,kind,number,COALESCE(supplier_id,''));
CREATE INDEX gk_part_alias_number ON gk_part_aliases(number);
INSERT INTO gk_part_aliases(part_id,kind,number) SELECT id,'part',number FROM gk_parts;
