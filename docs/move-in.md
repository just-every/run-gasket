# Move in from MaintainX

Gasket reads MaintainX's own CSV exports: assets, parts and meter readings. You see a dry run of everything before anything is written, and you can undo a move-in until Gasket records build on it.

## 1. Export from MaintainX

In MaintainX, open **Reporting → Export Data** and export as **CSV (Excel)** with all columns:

1. **Assets** (required);
2. **Parts** (optional);
3. **Meter Readings**, for manual meters (optional).

## 2. Dry run

In Gasket, open **More → Move in from MaintainX**, choose the three files and how dates are written in the reading export (month first, MaintainX's default, or day first), and press **Dry run**.

The dry run writes nothing. It shows:

- how many assets, meters, readings and parts would be created;
- every rejected row and why, for example a row with no location, a duplicate MaintainX ID, a criticality other than Normal, Important or Critical, or a counter reading lower than an earlier one;
- what needs your attention, such as an asset that was Offline in MaintainX;
- what is not carried across.

Fix rows in MaintainX and export again, or carry on without them. A dry run of files you already applied shows those rows as already moved in, unchanged.

## 3. Apply

**Apply this move-in** writes exactly the dry run you read. If the files change, Gasket asks you to run the dry run again. Applying the same files a second time adds nothing.

## 4. Undo

The **Move-in journal** lists every move-in. **Undo this move-in** removes everything it created, as long as nothing in Gasket has built on it yet. A work order, schedule, sighting, edit, reading or part movement on a moved-in record blocks undo, and the journal says how many.

## What is not carried

Asset hierarchy (each parent is kept as a note), teams, vendors, costs and depreciation, attachments, custom fields, procedures, PM schedules and work orders. MaintainX parts have no unit, so every part arrives in "each"; change units before your first count if needed. The custodian is MaintainX's first assigned team; change it to the person responsible.

After moving in, count your shelves, write your checklists and schedules in Gasket, and keep MaintainX read-only until a lead has run one full preventive cycle in Gasket.

The column-by-column mapping is in [the MaintainX mapping](../IMPORT.md).
