# Moving in from MaintainX

Gasket's first move-in kit reads MaintainX's own CSV exports, by the column names MaintainX documents. It runs on Base's import kit: a dry run that writes nothing, apply bound to the reviewed dry run, a durable journal with the original files retained, re-applying that adds nothing, and an undo that removes exactly one move-in.

## Export from MaintainX

From **Reporting → Export Data**, export as **CSV (Excel)** with all columns:

1. **Assets** (required). Gasket reads `ID`, `Name`, `Location`, `QR/Barcode`, `Serial Number`, `Teams Assigned to`, `Types`, `Criticality`, `Status`, `Parent`, `Description`, `Manufacturer`, `Model` and `Year`.
2. **Parts** (optional). Gasket reads `ID`, `Name`, `Part Numbers`, `Quantity`, `Minimum Quantity` and `Location`.
3. **Meter readings** for manual meters (optional). Gasket reads `Meter ID`, `Meter Name`, `Asset Name`, `Unit of Measure (U/M)`, `Reading`, `Entered On` and `Entered By`.
4. **Work orders** (optional, MIG-002), from **Work Orders → Export → CSV** with all columns, one file per date range. Gasket reads `ID`, `Title`, `Status`, `Work Type`, `Description`, `Asset`, `Asset ID`, `Completed on`, `Completed by`, `Assigned to`, `Categories`, `Recurrence` (or `Schedule`), `Total Parts Cost`, `Total Time Cost` and `Additional Costs`.

## How rows map

| MaintainX | Gasket | Rule |
| --- | --- | --- |
| Asset `QR/Barcode` (else `MX-` + `ID`) | Asset tag | A tag already used by an asset entered in Gasket, or by another row, is rejected. |
| `Name`, `Location`, `Serial Number`, `Types` (first) | Name, location, serial, category | A row without a name or location is rejected. |
| `Teams Assigned to` (first team) | Custodian | Listed as a gap: change it to the responsible person. |
| `Criticality` | Criticality | Normal, Important or Critical; anything else is rejected. |
| `Parent`, `Description`, `Manufacturer`/`Model`/`Year` | Notes | Gasket has no hierarchy; the parent is kept as a note and listed for attention. |
| `Status` Offline | — | Listed for attention: record downtime in Gasket if it is still down. |
| Part `Part Numbers` (first, else `MX-` + `ID`), `Name`, `Location` | Part | Unit is `each` (MaintainX has no unit column). |
| `Quantity`, `Minimum Quantity` | Opening stock movement, minimum | Up to three decimal places; anything else is rejected. |
| Reading `Meter ID` | Meter on the asset whose name matches `Asset Name` | The asset must be in the same move-in or already in Gasket, and the name must match exactly one asset. Units of hours, kilometres, miles, cycles or starts make a counter; anything else is a gauge. |
| `Reading`, `Entered On`, `Entered By` | Reading, its date and time, "MaintainX: name" | `Entered On` is read month-first or day-first as chosen. A counter reading lower than an earlier one is rejected; future dates are rejected. |

| Work order with `Status` Done | Asset history entry, at `Completed on` | Any other status is rejected (raise open work in Gasket). The asset is matched by `Asset ID` (a MaintainX asset in this move-in or already moved in), else by exact `Asset` name; a row with neither is rejected. History never raises work, moves a schedule or enters review. |
| `Work Type` | Preventive, corrective or other | Preventive stays preventive; Reactive or Corrective is corrective; anything else is other. |
| `Completed by`, `Assigned to`, `Categories`, `Recurrence` | "MaintainX: name", kept as text | Source people never get Gasket access. |
| `Total Parts Cost`, `Total Time Cost`, `Additional Costs` | Parts, labor and other cost in whole cents | Dollars with at most two decimals (`$` and thousands commas allowed); blank is not recorded; anything else is rejected. |

The first row for a MaintainX `ID` wins; a later row with the same ID is rejected as a duplicate. A work order already moved in by an earlier date range is recognised by its ID and left unchanged.

## Dry run, apply and undo

*More → Move in from MaintainX* takes the files and shows a dry run: what would be created, every rejected row with its reason, what needs attention and what is not carried. Nothing is written. **Apply** writes exactly that dry run; if the files change, the dry run must be repeated. Applying the same files again returns the same journal entry and adds nothing.

The journal lists every move-in. **Undo** removes everything that move-in created, only while nothing in Gasket has built on it: a work order, schedule, sighting, edit, native reading or part movement on a moved-in record blocks undo and is named, and so does work history a later move-in (another date range) added to its assets. After an undo, applying again is a new journal entry.

## Not carried

Asset hierarchy, teams, vendors, depreciation, attachments, custom fields, procedures, PM schedules, open work orders, procedure answers, time entries and IoT meter summaries. Write checklists and schedules in Gasket, count the shelves after moving in, and keep MaintainX read-only until a lead has run one full preventive cycle in Gasket.
