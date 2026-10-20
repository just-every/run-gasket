// Stable catalog review and undo snapshots, evaluated inside the write batch.
import type { Bindings } from '../auth.server'
import { one } from './core'

export const ITEM_COLUMNS = 'id,supplier_id,sku,description,kind,unit,price_cents,part_id,manufacturer,manufacturer_number,pack_milli,preferred'
export const PART_COLUMNS = 'id,number,name,unit,minimum_milli,location,origin,revision,import_revision,created_at,price_cents'
export interface Scope { parts: string[]; items: string[]; supplier: string; created: string[]; job?: string }
const inParts = (column: string) => `${column} IN (SELECT value FROM json_each((SELECT parts FROM scope)))`
const inItems = (column: string) => `${column} IN (SELECT value FROM json_each((SELECT items FROM scope)))`
const jsonRows = (table: string, columns: string, where: string) => `(SELECT json_group_array(json(data)) FROM (SELECT json_array(${columns}) AS data FROM ${table} WHERE ${where} ORDER BY ${columns}))`

// One stable SQL snapshot is used in review, the apply transaction and undo's guard.
// Besides direct FKs, retain supplier document and attributed action dependencies.
export const snapshotSql = `WITH scope AS (SELECT ? AS parts,? AS items,? AS supplier,? AS ignoreJob) SELECT json_object(
 'supplier',(SELECT revision FROM gk_suppliers WHERE id=(SELECT supplier FROM scope)),
 'parts',json(${jsonRows('gk_parts', PART_COLUMNS, inParts('id'))}),
 'items',json(${jsonRows('gk_supplier_items', ITEM_COLUMNS, `${inParts('part_id')} OR ${inItems('id')}`)}),
 'aliases',json(${jsonRows('gk_part_aliases','part_id,kind,number,supplier_id',inParts('part_id'))}),
 'canonical',json(${jsonRows('gk_part_canonical','part_id,canonical_id',`${inParts('part_id')} OR ${inParts('canonical_id')}`)}),
 'moves',json(${jsonRows('gk_part_moves','id,seq',`${inParts('part_id')} OR ${inItems('catalog_item_id')}`)}),
 'merges',json(${jsonRows('gk_part_merges','id',`${inParts('source_id')} OR ${inParts('canonical_id')}`)}),
 'photos',json(${jsonRows('gk_part_photos','id',inParts('part_id'))}),
 'substitutes',json(${jsonRows('gk_part_substitutes','part_id,substitute_id,reason,approved_by,approved_at,withdrawn_by,withdrawn_at',`${inParts('part_id')} OR ${inParts('substitute_id')}`)}),
 'kits',json(${jsonRows('gk_kit_lines','kit_id,part_id,quantity_milli,position',inParts('part_id'))}),
 'reservations',json(${jsonRows('gk_reservations','id,quantity_milli,released_at',`${inParts('part_id')} OR ${inParts('requested_part_id')}`)}),
 'bom',json(${jsonRows('gk_bom_lines','revision_id,part_id,quantity_milli',inParts('part_id'))}),
 'alternates',json(${jsonRows('gk_bom_alternates','revision_id,part_id,alternate_id',`${inParts('part_id')} OR ${inParts('alternate_id')}`)}),
 'counts',json(${jsonRows('gk_count_lines','id,counted_milli,expected_milli,seen_seq,state,move_id,decided_at',inParts('part_id'))}),
 'receipts',json(${jsonRows('gk_receipt_lines','id',inParts('part_id'))}),
 'policies',json(${jsonRows('gk_replenishment_policies','part_id,current_revision',inParts('part_id'))}),
 'policyRevisions',json(${jsonRows('gk_replenishment_policy_revisions','id',inParts('part_id'))}),
 'replenishments',json(${jsonRows('gk_replenishments','id,closed_at',inParts('part_id'))}),
 'notices',json(${jsonRows('gk_notices','id',inParts('part_id'))}),
 'proposals',json(${jsonRows('gk_proposals','id,status,payload_json,basis_json',`json_extract(payload_json,'$.part') IN (SELECT value FROM json_each((SELECT parts FROM scope)))`)}),
 'quotes',json(${jsonRows('gk_quotes','id',`supplier_id=(SELECT supplier FROM scope)`)}),
 'orders',json(${jsonRows('gk_purchase_revisions','id',`json_extract(snapshot,'$.supplier.id')=(SELECT supplier FROM scope)`)}),
 'requisitions',json(${jsonRows('gk_requisitions','id',`supplier_id=(SELECT supplier FROM scope)`)}),
 'imports',json(${jsonRows('gk_catalog_imports','id',`id IS NOT (SELECT ignoreJob FROM scope) AND undone_at IS NULL AND EXISTS(SELECT 1 FROM json_each(scope_json,'$.parts') a JOIN json_each((SELECT parts FROM scope)) b ON a.value=b.value)`)}),
 'actions',json(${jsonRows('gk_audit','seq',`action NOT IN ('catalog.import','catalog.undo') AND EXISTS(SELECT 1 FROM json_each((SELECT parts FROM scope)) p WHERE subject=p.value OR instr(detail,p.value)>0)`)})
) AS snapshot`
export const scopeParams = (scope: Scope) => [JSON.stringify(scope.parts),JSON.stringify(scope.items),scope.supplier,scope.job ?? null]
export const snapshot = async (env: Bindings, scope: Scope) => (await one<{ snapshot: string }>(env,snapshotSql,...scopeParams(scope)))!.snapshot

