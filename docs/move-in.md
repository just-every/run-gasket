# Move in from MaintainX

Gasket reads MaintainX's own CSV exports: assets, parts, meter readings and completed work orders. You see a dry run of everything before anything is written, and you can undo a move-in until Gasket records build on it.

## 1. Export from MaintainX

In MaintainX, open **Reporting → Export Data** and export as **CSV (Excel)** with all columns:

1. **Assets** (required);
2. **Parts** (optional);
3. **Meter Readings**, for manual meters (optional);
4. **Work Orders** (optional): from **Work Orders → Export**, CSV with all columns, one file per date range. Completed work moves in as asset history.

## 2. Dry run

In Gasket, open **More → Move in from MaintainX**, choose the files and how dates are written in the exports (month first, MaintainX's default, or day first), and press **Dry run**.

The dry run writes nothing. It shows:

- how many assets, meters, readings, parts and completed work orders would be created;
- every rejected row and why, for example a row with no location, a duplicate MaintainX ID, a criticality that is not one of your levels under **More → Codes and failures**, a counter reading lower than an earlier one, or a work order that is not Done;
- what needs your attention, such as an asset that was Offline in MaintainX, or a work order whose categories match no failure mode code (it moves in unclassified);
- what is not carried across.

Fix rows in MaintainX and export again, or carry on without them. A dry run of files you already applied shows those rows as already moved in, unchanged.

## 3. Apply

**Apply this move-in** writes exactly the dry run you read. If the files change, Gasket asks you to run the dry run again. Applying the same files a second time adds nothing. For the next date range, move in the asset export again with that range's work orders: work already moved in is recognised by its MaintainX ID and left as it is.

## 4. Undo

The **Move-in journal** lists every move-in. **Undo this move-in** removes everything it created, as long as nothing in Gasket has built on it yet. A work order, schedule, sighting, edit, reading or part movement on a moved-in record blocks undo, and the journal says how many. So does work history from a later move-in on its assets: undo the later date range first.

## What is not carried

Asset hierarchy (each parent is kept as a note), teams, vendors, depreciation, attachments, custom fields, procedures, PM schedules, open work orders, procedure answers and time entries. Completed work orders arrive as history only: they never raise work or move a schedule, and their recurrence is kept as text. MaintainX parts have no unit, so every part arrives in "each"; change units before your first count if needed. The custodian is MaintainX's first assigned team; change it to the person responsible.

After moving in, count your shelves, write your checklists and schedules in Gasket, and keep MaintainX read-only until a lead has run one full preventive cycle in Gasket.

The column-by-column mapping is in [the MaintainX mapping](../IMPORT.md).
