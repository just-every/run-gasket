# Getting started

This guide runs Gasket on your computer, signs you in as its owner and sets up your site.

## 1. Install rer

`rer` is the Run Edit Run command that installs, runs and keeps Gasket. You need it once per computer.

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
```

Or, with npm: `npm install -g @runeditrun/rer`.

## 2. Get Gasket and start it

```sh
git clone https://github.com/just-every/run-gasket.git
cd run-gasket
rer dev
```

The first `rer dev` installs the pinned dependencies, asks for the owner's email address, sets up a local owner on a free port and starts the app. When it is ready it prints `RER_READY` and a line starting `RER_OPEN`. Open that address in your browser on this computer: you arrive signed in as the owner. Treat that line as a password.

To stop Gasket, press Ctrl-C or run `rer dev --stop`. Run `rer dev` again to start it with your data as you left it.

## 3. Finish setup

Gasket first asks you to review the owner of the installation. Check the name and email, tick **I confirm this owner account is ready to use.** and press **Finish setup**.

## 4. Set up your site

Name the site whose equipment Gasket keeps and choose its time zone, then press **Save and register equipment**. Due dates, readings and downtime use this clock.

## 5. Register your equipment

On **Assets**, fill in **Register an asset**: the asset tag (the label on the equipment), its name, serial, location, the person responsible for it day to day, a category and how critical it is. On the asset's page, add its meters: a counter (run hours, kilometres), a gauge (a temperature, a pressure) or a condition (good, fair or poor).

Already on MaintainX? [Move in from MaintainX](move-in.md) brings your assets, parts and meter readings across instead.

## 6. Give your team access

On **More → People and access**, give each person their name, email and one role. They sign in at your Gasket with an emailed link. Ending someone's access signs them out everywhere at once.

Next: [Preventive work](preventive-work.md).
