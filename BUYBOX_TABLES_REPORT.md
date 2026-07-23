# Buy Box Tables Investigation — `user_alert_criteria` vs `user_preferences`

Investigation only — no code changed.

## Short answer

**`user_preferences` is the table the rest of the app actually reads from
to filter and display deal alerts.** `user_alert_criteria` is written in
two places but is only ever read back into the same narrow UI widget that
wrote it (the markets/zips chips in `BuyBoxPanel`) — it never reaches the
actual deal-matching logic. There is also a second, entirely unused
component (`AlertCriteriaSettings.jsx`) that reads/writes
`user_alert_criteria` but is not imported or rendered anywhere in the app.

---

## Every write site

| Table | Writer | Location |
|---|---|---|
| `user_alert_criteria` | `BuyBoxPanel.handleSave` | `src/App.jsx:778` (upsert) |
| `user_alert_criteria` | `AlertCriteriaSettings.handleSave` | `src/components/AlertCriteriaSettings.jsx:49` (upsert) |
| `user_preferences` | `App.handleSavePrefs` | `src/App.jsx:1748` (upsert) |

## Every read site

| Table | Reader | Location | What it does with the data |
|---|---|---|---|
| `user_alert_criteria` | `BuyBoxPanel`'s own `useEffect` | `src/App.jsx:744-748` | `.select('markets')` (and reads `data.zips` from the same row) → populates local `markets`/`zips` state, rendered as the market-chip and zip-chip UI inside `BuyBoxPanel` itself |
| `user_alert_criteria` | `AlertCriteriaSettings`'s own `useEffect` | `src/components/AlertCriteriaSettings.jsx:25-32` | `.select('*')` → populates that component's own local `criteria` state |
| `user_preferences` | App-level session-load effect | `src/App.jsx:1626` | `.select('*')` → sets `userPrefs` (line 1628), `emailAlertsEnabled` (1629), `alertFrequency` (1630) |

## Where the read data actually goes

- `userPrefs` (from `user_preferences`) is passed down as the `prefs` prop:
  `App.jsx:2591` → `DealAlerts` → `activePref = prefs || DEFAULT_PREFS`
  (`App.jsx:997`).
- `activePref` drives the **real deal-filtering logic** in `DealAlerts`
  (`App.jsx:1015-1033`): `matchingDeals` filters the global `deals` list by
  `activePref.min_score`, `.max_price`, `.min_cashflow`, `.min_cap_rate`,
  `.min_coc`. This is what decides which deal alerts a user actually sees.
- `activePref` is also passed into `BuyBoxPanel` as its `prefs` prop
  (`App.jsx:1037`), which seeds the sliders/inputs for min CoC, max price,
  etc. shown in the Buy Box panel.
- **`markets` and `zips`** (the two fields that live in `user_alert_criteria`
  and get read back by `BuyBoxPanel`'s own effect) are **not referenced
  anywhere in the `matchingDeals` filter**. They only round-trip: written to
  `user_alert_criteria` → read back by the same component → rendered as
  selected chips. They have no effect on which deals are shown or how deal
  alerts behave.
- `AlertCriteriaSettings.jsx` is **never imported anywhere** in the app.
  Checked: `src/main.jsx` only renders `<App />`, and `src/App.jsx` has no
  import of `AlertCriteriaSettings`. Confirmed via full-repo grep — the only
  match for `AlertCriteriaSettings` outside that file is its own function
  declaration. This component (and its read/write of `user_alert_criteria`)
  is dead code: it exists in the repo but nothing renders it, so its
  Supabase calls never execute in the running app.

---

## Is either table only ever written and never read?

No — both tables are read somewhere. But their read paths are very
different in consequence:

- **`user_preferences`**: written once (`handleSavePrefs`), read once
  (session-load effect), and that read value **actively drives the
  deal-alert filter and the Buy Box slider UI**. This is the live,
  consumed table.
- **`user_alert_criteria`**: written twice (`BuyBoxPanel.handleSave` and the
  orphaned `AlertCriteriaSettings`), read twice, but:
  - One reader (`BuyBoxPanel`'s own effect) only feeds back into the same
    component's chip UI — a closed loop with no downstream effect on
    filtering, scoring, or alerts.
  - The other reader (`AlertCriteriaSettings.jsx`) belongs to a component
    that is never mounted, so that read (and its corresponding write) never
    actually runs in production.

So `user_alert_criteria` isn't "write-only" in the strict sense, but
functionally it's close: the data it stores (`markets`, `zips`, plus a
second copy of `min_coc`/`max_price`/`property_types`/`email_alerts` that
duplicates fields already in `user_preferences`) never influences what the
app shows or does, other than re-populating the same input chips you just
set. It looks like a legacy/superseded table, with `user_preferences` +
`activePref` having become the actual mechanism, while the
`user_alert_criteria` write in `BuyBoxPanel.handleSave` and the whole
`AlertCriteriaSettings.jsx` component were left behind.

---

## Summary

```
user_preferences  ──write──  App.handleSavePrefs (App.jsx:1748)
                  ──read───  App session-load effect (App.jsx:1626)
                                └─► userPrefs → prefs → activePref
                                      ├─► DealAlerts.matchingDeals filter (LIVE)
                                      └─► BuyBoxPanel slider/input defaults (LIVE)

user_alert_criteria ──write── BuyBoxPanel.handleSave (App.jsx:778)
                    ──write── AlertCriteriaSettings.handleSave (dead component)
                    ──read─── BuyBoxPanel's own effect (App.jsx:745)
                                └─► markets/zips chips in the SAME panel only
                                      (no effect on filtering/alerts)
                    ──read─── AlertCriteriaSettings's own effect (dead component,
                                never mounted — never actually runs)
```

**Recommendation for follow-up (not acted on):** `user_alert_criteria` and
the `AlertCriteriaSettings.jsx` component look like a superseded
implementation. Before removing anything, worth confirming in Supabase
directly whether `user_alert_criteria` has any other consumer outside this
frontend (e.g., a backend job, cron, or email-alert sender reading it
server-side) — that would not show up in this codebase search.
