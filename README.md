<a name="readme-top"></a>

# Hypocaust

https://heatpumpload.org/

**Should this house get a heat pump, what size, and what will it actually cost?** A room-by-room load calculation and heat pump balance-point analysis that runs entirely in your browser.

No account. No server. No upload. Free software under the AGPL v3.

---

## Why this exists

If you are deciding whether to put a heat pump in an existing house, you need four numbers, and they have to come out of the same model:

1. What the house actually loses at the winter design temperature.
2. What a candidate heat pump can actually make at that temperature — which is not its nameplate.
3. The outdoor temperature where those two curves cross, and how many hours a year the site spends below it.
4. What the season costs at that crossing, against the furnace already in the basement.

Plenty of free tools will give you the first one. Almost nothing free will give you the other three, and the tools that model a season properly are not something you open in a browser and finish in fifteen minutes.

That is the gap. Not "free Manual J" — that exists in several forms, listed honestly below. The gap is the chain from load, to balance point, to annual dollars, in one continuous model, with nothing to install and no account to make.

The physics is not secret. Heat transfer through building assemblies, solar geometry, psychrometrics, and the sol-air method are published, unencumbered, and old. Design temperatures are percentiles of an hourly weather record that is now free to anyone. Hypocaust puts those together and keeps going past the BTU number.

## How this compares

Being straight about the field, because a tool that misrepresents its competition is not one you should trust with a load calculation either.

| Tool | Cost | Where it beats Hypocaust | Where it stops |
|---|---|---|---|
| **[OpenStudio-HPXML](https://github.com/NREL/OpenStudio-HPXML)** / EnergyPlus | Free software (BSD-3-like) | **The serious one.** Full hourly whole-building simulation, decades of validation, and its design load output can be submitted for ACCA Manual J approval. Strictly better physics than this. | It is an engine, not an interface — explicitly built to be driven by other software. You need Ruby, EnergyPlus, and a valid HPXML file before you compute anything. Nothing you hand a homeowner. |
| **BEopt** | Free | Drives OpenStudio-HPXML behind a real interface; assumptions follow ANSI/RESNET/ICC standards and the Building America protocols. | Desktop install, research-and-optimisation shaped. Heavy for a single retrofit question. |
| **Cool Calc** | Subscription | ACCA-approved, so it works for permits. Manual J, S **and D** — it designs ducts, which this does not. LiDAR geometry capture from a phone. | Paid for results. Closed source. No seasonal energy model, no fuel-cost comparison against the incumbent system. |
| **[LoadCalc.net](https://www.loadcalc.net/)** | Free, no login | The fastest thing on this list, and it has been quietly available for years. | Whole-house block load only — no room-by-room airflow. No heat pump modelling. Disclaims accreditation itself. Closed source. |
| **Simulations4All** | Free | Closest free analogue in spirit, and it publishes its verification cases, which almost nobody does. | Design temperatures follow "common practice" rather than the site's own record. Education-oriented. No bin hours, so no balance point. |
| **AutoHVAC** | Freemium | Reads a blueprint and pulls the geometry out. Genuinely useful automation this has no answer to. | Credit-limited. Closed source. |
| **ServiceTitan, FieldVibe, FieldPromax, Oasis, Fieldcamp** | Free | An answer in under a minute, fine for sanity-checking a contractor's quote. | Adjusted square footage with multipliers, not a load calculation — and by their own admission they break down on duct losses and unusual construction. They exist to sell field-service software. |

To put it plainly: if you are building a product, build on OpenStudio-HPXML. It is better than this and it is properly free. Hypocaust's claim is narrower — that between *"free calculator that stops at a BTU number"* and *"install Ruby and hand-write an HPXML file"* there is nothing you can simply open, and that the heat pump balance-point question specifically is unserved by anything free.

## What it does

- **Derives design conditions from the site's own weather history** instead of a lookup table. Pulls up to 30 years of hourly ERA5 reanalysis for the coordinates and computes the 99% / 99.6% heating and 1% / 0.4% cooling dry bulbs, the mean coincident wet bulb, the summer daily range, degree days, and the bin hours directly. The bin hours are the point — without them there is no balance point analysis, which is why the free calculators do not attempt one.
- **Walks the cooling design day hour by hour** and reports the load at the hour the *whole house* peaks — not the sum of each surface's individual worst moment, which is how naive calculators talk people into an extra half ton.
- **Models thermal mass.** Opaque surfaces are driven by a sol-air temperature that is delayed and flattened according to the assembly. Sun through glass is split into an immediate part and a radiant part that shows up over the next three hours.
- **Handles solar geometry properly.** Clear-sky irradiance per orientation from the site's latitude, and overhang shading by profile angle, so a two-foot eave over a south window does what it actually does.
- **Takes ducts seriously.** Conduction through the duct wall plus leakage into the buffer space it runs through. On the 1978 sample house this is the single largest term in the calculation — 26% of the heating load — and it is precisely the term the square-footage calculators admit they get wrong.
- **Corrects for altitude everywhere.** At 5,000 feet the air is 17% lighter, and every airflow constant moves with it. Most free calculators quietly assume sea level.
- **Finds the balance point.** Enter the capacity and COP your candidate heat pump publishes at 47, 17, 5, and −13 °F and read the crossing against the building load line, drawn over the hours the site actually spends at each temperature.
- **Prices the season.** Bin-hour energy for the heat pump, its backup heat, and the system it would replace, at your own utility rates.
- **Room-by-room airflow** in CFM, heating and cooling, so a duct designer has something real to work from.

## What it is not

This is a physics model built from published methods. It is not a certified implementation of ACCA Manual J, it carries no approval from any trade body, and it will not stand in for a stamped submittal where a jurisdiction demands one.

It also does not design ducts (that is Manual D), does not extract geometry from plans, and does not pretend to the validation record EnergyPlus has earned over thirty years.

Treat it as a serious second opinion: enough to check whether a quote was sized to the building or to a habit, enough to see what actually changes when you fix the envelope instead of buying more equipment, and enough to know before you sign whether the heat pump will still be making heat in February.

## Running it

```bash
npm install
npm run dev      # development server
npm run build    # static bundle in dist/
npm run test     # physics and climate verification suite
npm run preview  # serve the built bundle
```

The build output in `dist/` is plain static files. Host it anywhere — GitHub Pages, a bucket, a Raspberry Pi, a USB stick.

## Verification

`npm run test` runs a suite that checks the engine against known reference values rather than against itself:

- Psychrometric functions against ASHRAE reference points (saturation pressure, humidity ratio, wet bulb, barometric pressure and density ratio at altitude).
- Solar geometry against known solstice angles, and the east/west/north irradiance asymmetry that any correct model must produce.
- Overhang shading: a three-foot eave should kill a south window at noon and barely touch a west window at five.
- Whole-house loads for a 1978 house and a tight modern build, checked against the Btu/h per square foot and square feet per ton ranges those buildings actually land in.
- Sensitivity: tightening the envelope, adding insulation, moving ducts inside, and rotating the glazing must each move the answer in the right direction by the right order of magnitude.
- Design temperature percentiles, degree days, and bin hours against an independent computation over a synthetic record with known statistics.
- Degenerate inputs — no rooms, no windows, gaps in the weather record, HTTP failures — must degrade gracefully rather than produce a confident wrong number.

## Data

Weather comes from [Open-Meteo](https://open-meteo.com/)'s historical archive (ERA5 reanalysis), licensed **CC BY 4.0**. No API key, no account. Open-Meteo's own server is AGPL-3.0 and self-hostable, so the whole stack — application and data source — stays free software. Point `ARCHIVE_URL` in `src/lib/climate.ts` at your own instance if you would rather not depend on anyone.

## Privacy

There is no backend. Projects are stored in this browser's `localStorage` and never leave the machine. The only network request the app makes is to the weather archive, and only when you ask for it. Share links carry the entire job compressed inside the URL fragment, which by definition is never sent to a server.

## Stack

Vite, React, TypeScript. No runtime dependencies beyond React — the charts are hand-written SVG, the compression is the browser's own `CompressionStream`, the storage is `localStorage`. Nothing is minified into a black box.

## Method notes

Heating is a steady-state balance at the winter design temperature with no credit for solar or internal gain, which is the conventional and safe assumption for equipment that has to work at four in the morning.

Cooling walks all 24 hours of a July design day. Outdoor temperature follows the daily-range profile. Opaque surfaces use sol-air with a per-assembly lag and decrement. Glass conduction is instantaneous; transmitted solar is spread over a four-term radiant series. Attic temperature is modelled from roof sol-air rather than assumed. Infiltration converts a blower-door result through the leakage-area divisor approach, adjusted for stories, wind shielding, and climate severity, and is scaled up in winter and down in summer to reflect the driving pressure difference. Duct load is computed in a second pass once airflow is known, from conduction through the duct wall plus leakage to the surrounding buffer space.

## Licence

GNU Affero General Public License v3.0 only. See [`LICENSE`](LICENSE).

The AGPL is deliberate. If you run a modified version of this as a network service, the people using it are entitled to your source. Load calculation software has been a closed shop for forty years; this one should stay open even when someone hosts it.


--------------------------------------------------------------------------------------------------------------------------
== We're Using GitHub Under Protest ==

This project is currently hosted on GitHub.  This is not ideal; GitHub is a
proprietary, trade-secret system that is not Free and Open Source Software
(FOSS).  We are deeply concerned about using a proprietary system like GitHub
to develop our FOSS project. I have a [website](https://bellKevin.me) where the
project contributors are actively discussing how we can move away from GitHub
in the long term.  We urge you to read about the [Give up GitHub](https://GiveUpGitHub.org) campaign 
from [the Software Freedom Conservancy](https://sfconservancy.org) to understand some of the reasons why GitHub is not 
a good place to host FOSS projects.

If you are a contributor who personally has already quit using GitHub, please
email me at **kevinBell@Linux.com** for how to send us contributions without
using GitHub directly.

Any use of this project's code by GitHub Copilot, past or present, is done
without our permission.  We do not consent to GitHub's use of this project's
code in Copilot.

![Logo of the GiveUpGitHub campaign](https://sfconservancy.org/img/GiveUpGitHub.png)

<p align="right"><a href="#readme-top">back to top</a></p>
