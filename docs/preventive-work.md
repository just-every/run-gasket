# Preventive work

Preventive work starts from a checklist and a schedule. Gasket turns schedules that fall due into work orders when a lead asks.

## Write a checklist

On **Schedules**, under **Checklists**, give the checklist a name and write its items, one per line. Each line is one check the maintainer marks **Pass**, **Needs attention** or **Fail**.

To change a checklist, open it and **Publish a new revision** with a note of what changed. Work orders keep the revision they were created with, so a new revision never changes work already issued.

## Schedule it on an asset

Under **Schedule preventive work**, choose the asset and the checklist, give the work a title (for example "Monthly compressor check") and a default maintainer, then set its cadence:

- **Every (days)** with a **First due** date, for calendar work;
- **Or by counter meter** with **Every (meter units)**, for work by run hours, kilometres or cycles;
- or both: the work falls due at whichever comes first.

Calendar schedules keep a fixed cadence. The next due date is the previous due date plus the interval, not the day the work was done: a check due on 15 Oct every 30 days is next due on 14 Nov.

## Create due work orders

Press **Create due work orders** on **Work** or **Schedules**. Gasket creates one work order for each schedule due within the next seven days, or whose meter has reached its due value, and never a second open one for the same schedule. Each is assigned to the schedule's default maintainer.

Gasket does not create work in the background; it creates work when a lead presses the button, or when an approved agent proposal does.

## Assign and raise work

A lead assigns or reassigns any open work order from its page, under **Assignment**. Each maintainer sees their own list under **Assigned to me**.

For something that needs fixing now, open the asset and use **Raise corrective work**: say what needs doing, when it is due and who does it.

Next: [Doing the work](doing-the-work.md).
