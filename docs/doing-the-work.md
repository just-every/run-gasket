# Doing the work

The person a work order is assigned to records the work on its page. Every change is kept with who made it and when.

## Checklist results

For each step, give the answer it asks for and add a note, then press **Save results**. You can save part of the list and come back.

- A check: choose **Pass**, **Needs attention** or **Fail**.
- A reading: enter the number in the unit shown. Inside its limits (the limits count as inside) it passes; outside them it fails. When the step names a meter, the number is also kept as that meter's reading.
- A choice: pick one of the options; some options count as a fail.
- Text: write the answer.
- A photo: attach an image under **Inspection evidence**, choosing the step.

Some steps appear only after an earlier step has a given answer, such as a photo when a temperature is outside its limits. A step that does not apply says so and needs nothing.

A reading outside its limits needs a finding on that step with **Needs follow-up work** ticked before you can submit; a failed check or choice needs a finding on its step. A supervisor who did none of the work can grant an exception on a step with a reason, and that step then holds nothing up.

## Photos and documents

Under **Inspection evidence**, attach a photo or document of what you saw: PNG, JPEG, WebP, HEIC or PDF, up to 1.5 MB each. Evidence is kept inside your installation and only people with access can open it.

## Readings

Under **Meter and condition readings**, enter the time the readings were taken and a value for each meter you read. A counter never goes backwards: Gasket refuses a counter reading lower than an earlier one, or higher than a later one.

## Parts

**Issue part** takes parts off the shelf for this work order; you can never issue more than is on hand, less what is reserved for other work. Parts reserved for this work order are listed at the top of the card. **Return unused** puts back what you did not use; you can never return more than you issued. The card shows what was issued, returned and used.

## Downtime

If the asset has to come out of service, press **Record asset down** with the time it went down and why, then **Record back in service** when it is running again. Gasket works out the minutes. An asset is down only once at a time, and a new outage cannot start inside an earlier one.

Tick **Planned stop (not a failure)** when the stop was planned, such as a shutdown window; otherwise it counts as a failure, and you can choose its **Failure mode**. The card shows what each stop counts as. A lead can correct that later on the Reliability page; the original stays on record.

## Findings

Under **Corrective findings**, choose the checklist step the finding is about (or the whole work order), then record what you found and what you did, with a severity of Low, Medium or High. Tick **Needs follow-up work** to raise a corrective work order linked to this one.

## Comments and shift handoffs

Every work order and asset page has **Comments**. Write a note, attach up to four photos, tick the people who should know (each gets a notice on **Notices** that opens the comment), and tick **This is a shift handoff summary** when you hand a job to the next shift. Comments are internal notes for people with access to Gasket. Comments from others that you have not seen are marked **Unread** until you open the page. You can edit your own comment; the earlier versions stay readable. Closing a work order keeps its comments, and you can still add to them.

## Submit for review

The bar at the bottom of the page says what still blocks submission. You can submit when every item has a result, every fail or needs-attention step has its own linked finding, and no downtime is still open. Then press **Submit for review**.

If the supervisor returns the work, their reason appears under **Reviews**; record what is missing and submit again.

Next: [Review and the board](review-and-board.md).

## Priority and work templates

Every work order has a priority: emergency, high, normal or low. A lead raising work from an asset can pick a template from **Work templates** (in the menu), which fills the title, instructions, priority and estimate; anything typed on the work wins. Editing a template saves its next revision and never changes work already made from it; the work order shows which template and revision it came from. A lead changes a work order's priority from its **Priority** card with a reason. **Raise for several assets** on a template raises its work for each ticked asset; leave **Preview only** ticked to see what would be raised first.
