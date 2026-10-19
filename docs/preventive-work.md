# Preventive work

Preventive work starts from a checklist and a schedule. Gasket turns schedules that fall due into work orders when a lead asks.

## Write a checklist

On **Schedules**, under **Checklists**, give the checklist a name and write its steps, one per line. A plain line is a check the maintainer marks **Pass**, **Needs attention** or **Fail**. Add parts after a `|` to type a step: `number °C -25..-18` (a unit, then inclusive limits; leave either side empty), `text`, `options none, light, heavy | fail on heavy`, or `photo`. `when step 1 is fail` makes a step apply only after that answer, and `meter Cabinet temperature` keeps a number as that meter's reading (same unit).

A step keeps its identity in a new revision when its label stays the same; to rename one, add `key` and the key shown on the checklist page.

To change a checklist, open it and **Publish a new revision** with a note of what changed. Work orders keep the revision they were created with, so a new revision never changes work already issued.

A lead can also approve the checklist's **Failed-step rule**: which results (Fail, Needs attention or both) raise a correction, its severity and how many days it is due in. When a maintainer records such a result, Gasket records that step's finding and raises a corrective work order for the same maintainer, carrying the step, the note, the readings and the evidence. The maintainer acknowledges the correction before submitting it, and the original failure counts as resolved only when a supervisor approves the correction; closing the inspection leaves the correction open on the board.

## Schedule it on an asset

Under **Schedule preventive work**, choose the asset and the checklist, give the work a title (for example "Monthly compressor check") and a default maintainer, then set its cadence:

- **Every (days)** with a **First due** date, for calendar work;
- **Or by counter meter** with **Every (meter units)**, for work by run hours, miles or cycles;
- or both: the work falls due at whichever comes first.

Calendar schedules keep a fixed cadence. The next due date is the previous due date plus the interval, not the day the work was done: a check due on 15 Oct every 30 days is next due on 14 Nov.

## Create due work orders

Gasket does this on its own every 15 minutes, issuing calendar work the site's lead time ahead of its due date (seven days unless the owner sets another on the Site page), and a reading that reaches a meter's due value or trigger raises its work at once; **Automatic scheduling** on **Schedules** shows the last run, any time it was not running, and work it issued after its due date. A work order cancelled by a person stays owed: the scheduler does not issue that occurrence again. You can also press **Create due work orders** on **Work** or **Schedules**. Gasket creates one work order for each schedule due within the next seven days, or whose meter has reached its due value, and never a second open one for the same schedule. Each is assigned to the schedule's default maintainer.

Gasket does not create work in the background; it creates work when a lead presses the button, or when an approved agent proposal does.

## Inspection routes and calibration

An **inspection route** under **Schedules** is two or more stops, each an asset and the checklist done there. Give it **Repeat every (days)** and a **First due** date and Gasket issues a run on its own once each date is within the site's lead time: one work order per stop, each pinned to its checklist's current revision. A failed reading raises its follow-up on that stop alone; a stop that cannot be done is recorded as missed with a reason and stays open, and a supervisor can sign the run off only once every stop is closed.

A **calibration task** is a schedule on an instrument. Its procedure's number steps with limits are the tolerances, and its grace (days) is how long after the due date it still reads due rather than overdue. Routes and calibration tasks can name **required tools**: whoever does the work records which one they used (its serial or asset number) before submitting. Calibration work also needs its certificate, attached under **Inspection evidence** and marked as the certificate. When it is approved, the certificate becomes the instrument's next version, with the procedure revision, the tools used, and whether the readings were in tolerance. Gasket reads the readings against the limits; it does not certify the instrument.

## Assign and raise work

A lead assigns or reassigns any open work order from its page, under **Assignment**. Each maintainer sees their own list under **Assigned to me**.

For something that needs fixing now, open the asset and use **Raise corrective work**: say what needs doing, when it is due and who does it.

## Change, cancel, merge and reopen work

Under **Assignment**, a lead can cancel a work order with a reason, or merge a duplicate repair into the work order that carries on: the duplicate is cancelled with a link to it and keeps its own photos and records. **Changes to this work order** lists every cancellation, reschedule, reopening and merge with its reason. A cancelled work order, or a reviewed repair whose fault came back, can be reopened with a reason; a reopened repair goes back for rework and a fresh review.

Cancelling preventive work does not cancel the obligation: its schedule shows **Overdue** until the work is issued again or a lead presses **Ask to skip** with a reason and an owner or supervisor approves it; then the schedule moves on to its next due date and the missed occurrence stays listed under **Skips and deferrals**.

## Seasons, weekdays, holidays and deferrals

A calendar schedule can run on fixed dates or count from completion (the day its work is approved), only in some months or on some weekdays, and moves off the site's holidays and shutdown windows unless set to run through them. Add closed days under **Calendar** on the Schedules page. A due date that lands on a day it may not fall moves to the next allowed day. A lead can ask to defer the current occurrence, up to the schedule's deferral limit; an owner or supervisor approves it before anything moves. On a site with one owner and no supervisor, the owner approves their own request by ticking the single-approver confirmation, and the decision is labelled so. Changing a schedule shows its issued work, which keeps its due date and checklist, and the next five dates before and after the change.

Through the JSON door (`workorders.bulk`), a lead can assign, reschedule or cancel many work orders at once: a preview first lists each one's outcome and what else it touches, such as a schedule or open follow-up work, without changing anything, then each work order succeeds or fails on its own.

Next: [Doing the work](doing-the-work.md).

## Reminders, blockers and escalation

Gasket reminds the assignee a day before work is due and again once it is overdue, under **More → Notices** and on the work order. The assignee answers **I am on it** or **Report a blocker**: parts, access, skill or production, with who owns it, the next action and when it is promised. If nobody answers, or the work stays overdue, the leads are told, and after longer the supervisors; a blocker that misses its promised date is chased too. A lead sets these days under **Chase rule**. Handing overdue work to someone else is a lead's decision and keeps its overdue age. Email and push are not sent yet: the notices are in Gasket.
