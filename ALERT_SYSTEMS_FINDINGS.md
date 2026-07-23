# Alert Systems Findings

Documents a discovery made after the initial buy-box table investigation
(`BUYBOX_TABLES_REPORT.md`): the earlier conclusion that `user_alert_criteria`
looked like dead/legacy data was **incomplete** — it didn't account for
server-side Supabase edge functions, which live outside this repo. Those
functions reveal the app is actually running **two parallel, independent
daily alert systems**, each keyed off a different table.

## System A — poll-and-match (edge function)

- Cron schedule: **1pm daily**.
- Reads **`user_alert_criteria`**.
- Polls RentCast for **new listings** in each user's watched markets.
- Filters candidate listings by `max_price`, `min_coc`, `property_types`.
- Emails the user when a matching listing's `deal_score >= 70`.
- Sends from **alerts@rental-analyst.com**.

## System B — send-deal-alerts (edge function)

- Cron schedule: **12pm daily**.
- Reads **`user_preferences`**.
- Pulls candidates from the existing **`deal_alerts`** table (deals already
  surfaced site-wide, not fresh RentCast polling).
- Filters by `min_score`, `cashflow`, `cap_rate`.
- Throttles send frequency using `alert_frequency`.
- Sends from **deals@rental-analyst.com**.

## How the live UI feeds both systems

The Buy Box save in `src/App.jsx` (`BuyBoxPanel.handleSave`, ~line 774)
writes to **both** tables in a single click:

- Direct upsert into `user_alert_criteria` (line 778) — feeds **System A**.
- `onSave(local)` → `App.handleSavePrefs` upsert into `user_preferences`
  (line 1748) — feeds **System B**.

Net effect: every user who saves their Buy Box is enrolled in both alert
systems simultaneously, with two different filter rulesets, two different
schedules, and two different sending addresses.

## Correction to prior finding

`user_alert_criteria` is **NOT dead code**. The earlier report
(`BUYBOX_TABLES_REPORT.md`) only traced reads/writes within this frontend
repo and concluded `user_alert_criteria` was write-mostly/legacy. That
conclusion was wrong — it depended on visibility into `supabase/functions`,
which don't exist in this repo. System A (poll-and-match) depends on
`user_alert_criteria` directly. Any future cleanup must account for this
dependency and not treat the table as safe to drop based on frontend
tracing alone.

## Unverified

Edge function logs showed **no recent invocations** for either function.
It is currently **unverified whether either system is actually sending
emails** in production — the cron schedules and code paths exist, but
recent execution/delivery has not been confirmed.

## Open decision for next session

Pick one canonical alert system (System A or System B) or merge them into
one. **Do not remove `user_alert_criteria` or the redundant
`user_preferences`/`user_alert_criteria` dual-write in `BuyBoxPanel.handleSave`
until this is resolved** — doing so before deciding would silently unenroll
users from whichever system depends on the removed table.
