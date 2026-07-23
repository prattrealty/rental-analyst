# Save Logic Investigation — src/App.jsx

Investigation only — no code changed. This documents how the various "save"
named things relate, because several of them share names but do different
things.

## Key finding up front: there are TWO `handleSave` functions and TWO `saved` variables

Same names, different scopes, different data. This is the root of the
confusion.

| Name | Location | Scope | What it actually is |
|---|---|---|---|
| `handleSave` | line 774 | inside `BuyBoxPanel` component | saves buy-box/alert **preferences** |
| `handleSave` | line 1778 | top-level `App` component | saves the currently-analyzed **property** |
| `saved` | line 734 | inside `BuyBoxPanel` component | `useState(false)` — a **boolean** UI flash flag |
| `saved` | line 1702 | top-level `App` component | `useState([])` — an **array of saved properties** |

The button at line 2283 (the one relabeled to "Save" today) uses the
App-level `handleSave` and the App-level `saved` array. It has nothing to do
with `BuyBoxPanel`'s versions.

---

## 1. What does `handleSave` actually do? Does it write to `user_alert_criteria`?

**There are two, and only one of them touches `user_alert_criteria`.**

**App-level `handleSave` (line 1778)** — this is the one wired to the button
at line 2283:
- Guards: requires a signed-in user (`supaUser`), and if not Pro/trial and
  `saved.length >= FREE_LIMIT`, opens the upgrade modal instead of saving.
- Builds `entry = { id: Date.now(), fields: {...fields}, metrics }` — a
  snapshot of the property currently loaded in the analyzer.
- Inserts into Supabase table **`properties`** (line 1783-1787): `user_id`,
  `address`, `data: entry`.
- On success, appends `entry` to the App-level `saved` array (line 1789-1790)
  and shows a toast with the free-plan usage count.
- Side effect unrelated to "saving": if the deal score is ≥ 70, it also
  inserts a row into the site-wide `deal_alerts` table (line 1800) — a bonus
  behavior triggered by the same click, not part of the save action itself.
- **Does not write to `user_alert_criteria`.**

**BuyBoxPanel's `handleSave` (line 774)** — this is the one that *does*
touch `user_alert_criteria`:
- Calls `onSave(local)` (see question 2).
- Upserts directly into Supabase table **`user_alert_criteria`** (line
  778-786): `user_id`, `markets`, `zips`, `min_coc`, `max_price`,
  `property_types`, `email_alerts`.
- Sets its own local `saved` boolean to `true` for 2 seconds to flash
  "Saved!" on its own button (line 788-789, rendered at line 801-804).

So: the premise "handleSave writes to user_alert_criteria" is correct only
for the `BuyBoxPanel` version. The App-level `handleSave` — the one behind
the button you're asking about relabeling — writes to `properties` and never
touches `user_alert_criteria`.

---

## 2. `onSave(local)` inside BuyBoxPanel's handleSave — what is it?

Prop chain, traced end to end:

```
BuyBoxPanel  onSave prop
  ← passed as onSave={onSavePrefs}      from DealAlerts       (line 1037)
DealAlerts   onSavePrefs prop
  ← passed as onSavePrefs={handleSavePrefs}  from App/Portfolio  (line 1200, 2592)
```

So `onSave(local)` ultimately calls **`handleSavePrefs`** (App-level, line
1746):
- Builds `record = { ...newPrefs, user_id, updated_at, email_alerts_enabled,
  alert_frequency }`.
- Upserts into Supabase table **`user_preferences`** (line 1748).
- On success, updates local React state `userPrefs`.

**It saves a property of preferences (buy-box settings), not a property
listing.** "Property" here means "a preference field," not "a rental
property" — worth being explicit about since the word is overloaded in this
codebase.

Net effect: one click of BuyBoxPanel's Save button writes the same buy-box
data to **two different tables** by two different code paths —
`user_alert_criteria` (direct upsert inside `BuyBoxPanel.handleSave`) and
`user_preferences` (via `onSave` → `handleSavePrefs`). That duplication is
real and is a separate issue from the naming collision.

---

## 3. `onSavePrefs` vs `handleSave` — how do they differ?

They aren't variants of the same thing; they save entirely different data to
entirely different tables:

- `onSavePrefs` (→ `handleSavePrefs`) saves **buy-box / alert preferences**
  (markets, zips, price thresholds, email alert cadence) to
  `user_preferences`.
- `handleSave` (App-level, the one behind the line-2283 button) saves a
  **property analysis** (the fields + computed metrics for whatever's loaded
  in the analyzer) to `properties`.

Different data, different tables, different UI surfaces (`BuyBoxPanel`
inside Deal Alerts vs. the analyzer sidebar). The only reason they read as
related is the shared "save" vocabulary in their names.

---

## 4. What is `saved` actually a list of — properties or criteria? Where is it populated?

Answered fully in the table at the top, but in detail:

**The `saved` that matters for `FREE_LIMIT` and the line-2283 button is the
App-level one (line 1702, `useState([])`).** It is an **array of saved
properties** — entries shaped like `{ id, fields, metrics }` — never
criteria/preferences.

Populated by:
- Loaded from Supabase on mount/login (~line 1617, "Load saved properties"
  comment) — reads from the `properties` table.
- Appended to in App-level `handleSave` (line 1789-1790) after a successful
  insert into `properties`.
- Filtered (item removed) in `handleDelete` (line 1814-1817), which also
  deletes the row from `properties`.

**The other `saved` (line 734, inside `BuyBoxPanel`) is a completely
different variable: a `useState(false)` boolean.** It holds no list at all —
it's purely a transient UI flag that flips to `true` for 2 seconds after a
successful save, to swap the button's icon/label to "Saved!" (line
788-789, 801-804), then flips back. It is never compared to `FREE_LIMIT` and
has no relationship to the App-level `saved` array beyond sharing a variable
name in a different scope.

**Confirmed: these are two distinct variables, not one being read from two
places.** `saved.length` (App-level) is a real count of persisted
properties; `saved` alone (BuyBoxPanel-level) is a boolean and would be
nonsensical to call `.length` on.

---

## 5. What should the line-2283 button actually be called?

Given what it does — insert the analyzer's current property into
`properties` and increment the free-plan counter shown right next to it
(`saved.length / FREE_LIMIT`, line 2285) — the label should name the
property-save action specifically, not a generic account-level "Save."

Git history confirms this button *was* more specific until today:

```
commit 3672749 "Relabel save button to accurate wording" (2026-07-23)

- <button ... aria-label="Save property to portfolio" ...>
-   <i className="ti ti-bookmark" /> Save property
+ <button ... aria-label="Save to your account" ...>
+   <i className="ti ti-bookmark" /> Save
```

The relabel changed "Save property" → "Save" and
"Save property to portfolio" → "Save to your account" — moving from a
specific, accurate label to a vague one, despite being titled "Relabel save
button to accurate wording." Given the button's real behavior, something
like **"Save property"** (or "Save to portfolio," matching the `Portfolio`
component at line 1151 that lists these same entries) reflects what the
button does better than plain "Save."

---

## Full map

```
Button @2283 "Save"  ──onClick──►  App.handleSave (line 1778)
                                      ├─ INSERT properties table
                                      ├─ setSaved([...saved, entry])
                                      │     saved = ARRAY of properties (App-level, line 1702)
                                      └─ (side effect) maybe INSERT deal_alerts table

BuyBoxPanel "Save" (line 801) ──onClick──►  BuyBoxPanel.handleSave (line 774)
                                      ├─ onSave(local) ──► App.handleSavePrefs (line 1746)
                                      │                       └─ UPSERT user_preferences table
                                      ├─ UPSERT user_alert_criteria table (direct)
                                      └─ setSaved(true)
                                            saved = BOOLEAN flash flag (BuyBoxPanel-level, line 734)
```

## Open issues flagged (not fixed — investigation only)

1. **Naming collision**: two `handleSave` functions and two `saved`
   variables across scopes, none of which relate to each other. Purely a
   readability/maintainability hazard, not a bug.
2. **Duplicate persistence**: BuyBoxPanel's save writes the same buy-box
   data to both `user_alert_criteria` and `user_preferences` in one click —
   worth confirming whether both tables are actually needed or if one is
   dead/legacy.
3. **Label regression**: today's commit `3672749` made the line-2283 button
   label less specific ("Save property" → "Save"), which cuts against what
   the button actually does.
