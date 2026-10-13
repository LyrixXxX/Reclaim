# Reclaim

Public privacy policy: https://reclaim-privacy-policy.pages.dev/ (source: `docs/privacy/index.html`).

A private, dark-mode personal health dashboard built with Expo Router and
TypeScript. Reclaim stores tracker, health, CPAP, weight, medication,
laboratory, and nutrition history locally with AsyncStorage. There are no
accounts.

## Included

- Customizable Home dashboard with reorder handles, accessible move buttons, compact/expanded widgets, and selected labs/habits
- Reusable quit, taper, and habit trackers with cumulative history
- Health readings, medications and reminders, and laboratory trends
- CPAP image extraction, trends, care reminders, and doctor summaries
- Weight history and rolling trend charts
- Nutrition goals derived from carbohydrate, protein, and fat targets
- Manual food logging, saved foods, meal groups, fiber, and intake trends
- Optional AI-assisted meal descriptions and nutrition-label extraction
- Local backup and restore, including saved source photos

Nutrition AI is optional. It uses a separately deployed stateless relay so an
OpenAI API key is never embedded in the Android app. Manual nutrition tracking
continues to work offline.

Reclaim is a personal tracking tool and does not provide medical advice.

## Home dashboard

Running record lists use the shared `HistoryPages` component: seven entries per
page, newest first, with Previous/Next controls. This applies to CPAP nights and
settings, weight, blood pressure, medication events, lab results, habit entries,
and taper steps. Seven entries need not equal a calendar week when dates are
missing or multiple events occur on one day. Date headings are retained within
each page. Charts, calculations, backups, and reports always use the full input
history; Nutrition retains its existing day-by-day navigation. New running logs
should reuse this component rather than render an unbounded list.

Home is the normal launch destination; Habits is now its own tab. Use **Edit
dashboard** (also available in Settings) to toggle widgets, reorder them, and
choose their details. Drag the handle to move between visible rows; use the
up/down buttons for longer moves or accessibility. Save applies the draft;
Cancel leaves the previous layout unchanged. Restoring defaults requires
confirmation and still needs Save to apply.

Dashboard preferences are local and included in full backups. Hiding a section
or Health module in Settings suppresses its widgets and quick actions without
deleting records or layout preferences. Labs and Habits are optional widgets;
their expanded cards preview up to three selected items. Open their sections
for the full list. Reading cards label their recorded dates; Nutrition is today
so far, not a completed-day average. Medication cards summarize recorded doses
and pending daily/weekly slots; interval and as-needed schedules remain in the
Medications screen.

Device review checklist: launch to Home, drag and use move buttons, save and
reopen, cancel a draft, hide a section, restore defaults, test quick actions,
and review at 360px width and with enlarged system text. Automated checks do
not replace this hands-on review.

## Run

```bash
npm install
npm start
```

Then open the app with Expo Go, an Android/iOS simulator, or press `w` for web.

## Quality checks

```bash
npm run verify
```

This runs Expo ESLint, strict TypeScript checking, the Jest test suite, and the
Nutrition AI relay tests.

## Google Play internal test

From PowerShell in this folder, set `EXPO_PUBLIC_STADIA_MAPS_KEY` in that same
terminal as for the phone builds, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-local-android.ps1 -PlayBundle
```

The script builds and verifies a signed `dist\Reclaim-android-release.aab` on
your PC. Upload that **AAB**, not the APK, in Play Console under **Test and
release → Testing → Internal testing → Create new release**. Add your Google
account to the internal testers list, roll out the release, and install it using
the tester opt-in link. The existing command without `-PlayBundle` still builds
an APK for direct phone installs. Increase Android `versionCode` for every
subsequent Play upload.

A Play-installed copy may use a different signing certificate from a sideloaded
APK and therefore may not install over it. Use a spare phone for the first Play
test, or export a Reclaim backup before replacing an existing installation.
