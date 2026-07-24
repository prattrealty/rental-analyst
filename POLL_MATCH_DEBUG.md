# poll-and-match: why 0 invocations / empty logs despite cron "succeeded"

## TL;DR

The symptom pattern — pg_cron's `net.http_post` reports `succeeded`, but the function's dashboard shows **0 invocations and empty logs** — almost certainly means the request is being **rejected before it ever reaches `Deno.serve`'s handler**. `pg_cron`/`pg_net` only checks that an HTTP response came back; it does not care whether that response was a 200 or a 401/404. That's consistent with the gateway (JWT verification) or a routing/URL problem intercepting the request, not with anything inside this function's code.

Everything inside the function body (missing `RENTCAST_API_KEY`, missing `RESEND_API_KEY`, empty tables, etc.) is wrapped in a try/catch and preceded by `console.log('Markets to poll:', allMarkets)`. **Any of those failure modes would still produce at least one invocation and at least one log line.** Since logs are completely empty, the code inside `Deno.serve(...)` never ran at all. That rules out the function's internal logic as the primary cause and points at the platform layer in front of it.

## Most likely cause: JWT verification blocking the request (highest confidence)

Supabase Edge Functions default to **`verify_jwt = true`**. When enabled, the edge gateway checks for a valid `Authorization: Bearer <jwt>` (or matching `apikey`) header **before the function's code is invoked**. A request that fails this check:

- Gets a `401 Unauthorized` response — which is a completed HTTP response, so `net.http_post` / the pg_cron job log it as `succeeded`.
- Never reaches `Deno.serve`, so it does not increment the invocations counter and produces no logs.

This exactly matches the reported symptoms.

**How this usually happens with a cron-triggered function:**
- The `cron.schedule(...)` call's `net.http_post` body doesn't set an `Authorization` / `apikey` header at all (very common when copy-pasting `pg_cron` + edge function tutorials).
- The header is set but uses the wrong key (e.g., a stale/rotated anon key, or a project-mismatched key).
- The function was deployed/redeployed without `--no-verify-jwt`, silently re-enabling verification after someone had previously turned it off.

**To confirm:** check the function's settings in the Supabase dashboard (Edge Functions → poll-and-match → "Enforce JWT Verification" toggle), and inspect the actual `cron.job` definition (`select * from cron.job;` / the `net.http_post` call it runs) to see what headers, if any, are being sent.

## Second most likely cause: URL/routing mismatch

If the cron job's `net.http_post` URL has a typo, points at the wrong project ref, or references an old/renamed function slug, the request can still get a response (e.g., a 404 from the edge gateway) that `pg_net` treats as "succeeded," while never touching this function's code. Worth diffing the URL in the cron job against the actual deployed function URL for this project.

## Why the env vars are NOT the primary suspect (but still worth checking)

- **`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`**: these are reserved, platform-injected env vars for Edge Functions — you normally can't (and don't need to) set them manually; Supabase provides them automatically at runtime. If they were somehow missing, `createClient(undefined, undefined)` would throw at module-load time (supabase-js validates the URL immediately), which would likely surface as a boot/deployment error rather than silent 0-invocation behavior. Worth a quick sanity check in the dashboard, but this is not consistent with "empty logs" — a boot crash typically still logs something.
- **`RENTCAST_API_KEY`**: if unset, `fetch(rentcastUrl, { headers: { 'X-Api-Key': undefined } })` still executes and Rentcast will return a non-OK response. That's handled gracefully:
  ```js
  if (!rentcastRes.ok) {
    console.error(`Rentcast error for ${market}:`, rentcastRes.status, await rentcastRes.text())
    continue
  }
  ```
  This would produce console output and a real invocation — not silence. So a missing key here explains "no new listings" but not "0 invocations."
- **`RESEND_API_KEY`**: if unset or invalid, `sendAlertEmail` will get a non-OK response from Resend — **but the code never checks it**:
  ```js
  await fetch('https://api.resend.com/emails', { ... })
  ```
  No `.ok` check, no `try/catch`, and the caller increments `emailsSent++` unconditionally right after the `await`, regardless of whether Resend actually accepted the email. **This is a real, separate bug**: even once invocations start showing up, this function will happily report `emails_sent: N` while silently failing to deliver any email if `RESEND_API_KEY` is missing/invalid/revoked. Recommend adding a response-status check and logging/throwing on failure.

## Does it error on empty data?

No — the empty/edge-case paths are all handled defensively and would not crash or short-circuit before logging:
- No users with `email_alerts = true` → early `return` with a 200 and a message (no crash).
- No listings returned for a market → `continue` to next market.
- Malformed `market` string (missing `", "`) → `continue`.
- No rent estimate or price → `continue` before scoring.
- Deal score below 70 → `continue`, no email (working as intended, not a bug).

None of these produce the "0 invocations / empty logs" symptom — they'd all still count as an invocation with associated log output.

## Other latent issues worth flagging (not root cause, but will bite later)

1. **`supabase.auth.admin.listUsers()` is paginated** (default page size 50, unpaginated calls only return the first page). If there are more than 50 auth users, some `user_alert_criteria` rows won't resolve to an email and will be silently skipped from `userMap` — no error, just missing matches.
2. **`sendAlertEmail` has no error handling** (see above) — will falsely report success.
3. The `listing_url` is a synthesized Zillow search URL (`/homes/{encoded address}`), not a guaranteed-valid deep link — not a crash risk, just a UX quality issue.

## Recommended next steps (in priority order)

1. In the Supabase dashboard, check whether **"Enforce JWT Verification"** is ON for `poll-and-match`. If ON, either turn it off (if this is meant to be a public/cron-only endpoint) or fix the cron job to send a valid `Authorization`/`apikey` header.
2. Inspect the actual `cron.job` row / `net.http_post` call (`select * from cron.job;`, `select * from cron.job_run_details order by start_time desc limit 5;`) to see exactly what URL and headers are being sent, and what HTTP status code came back (not just "succeeded").
3. Once invocations start showing up in the logs, verify `RENTCAST_API_KEY` and `RESEND_API_KEY` are actually set (`supabase secrets list`) and valid.
4. Add a response-status check + logging to `sendAlertEmail` so silent Resend failures become visible.
