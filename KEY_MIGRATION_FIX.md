# poll-and-match: fixing AuthApiError bad_jwt on auth.admin.listUsers()

## Context

Previous fix (see `POLL_MATCH_DEBUG.md`) addressed the edge **gateway's** inbound JWT verification (the check that runs before your function code is invoked — `verify_jwt` on the function itself, checking the request's own `Authorization`/`apikey` header from the cron caller). That is a **separate concern** from the error now being hit.

The current error (`AuthApiError: bad_jwt` at `supabase.auth.admin.listUsers()`) happens **inside** the function, when the Supabase client it creates makes an *outbound* call to the Auth/GoTrue admin API. That call is authenticated using whatever key `createClient()` was given — i.e. `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. This is now failing because the legacy key itself is being rejected by Supabase's Auth server, not because of the function's own gateway settings.

## Root cause

Supabase is migrating away from JWT-based `anon` / `service_role` keys to a new **publishable / secret key** system:

- `anon` → replaced by **publishable key**, format `sb_publishable_...`
- `service_role` → replaced by **secret key**, format `sb_secret_...`

Legacy keys are being deprecated project-wide by end of 2026. Once a project's dashboard marks `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` as **DEPRECATED**, the underlying JWT those keys are signed with is no longer guaranteed valid against the Auth server's current signing keys — that's exactly what produces `bad_jwt` when the deprecated `service_role` value is used to call an admin endpoint like `listUsers()`.

Critically, **the new secret/publishable keys are not JWTs at all** — they're opaque tokens (`sb_secret_...` / `sb_publishable_...`). They must be sent only via the `apikey` header; if a client also stuffs the same value into `Authorization: Bearer ...`, the gateway tries to parse it as a JWT and rejects it. Modern `@supabase/supabase-js` versions detect the `sb_secret_`/`sb_publishable_` prefix and handle this correctly on their own — you don't need to manually set headers, you just need to hand it the right key.

## What's auto-injected today

Supabase Edge Functions currently inject **both** the legacy and new key variables simultaneously (they coexist during the migration window):

| Variable | Format | Status |
|---|---|---|
| `SUPABASE_ANON_KEY` | JWT | deprecated |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT | deprecated |
| `SUPABASE_PUBLISHABLE_KEYS` | JSON dict, e.g. `{"default": "sb_publishable_..."}` | current |
| `SUPABASE_SECRET_KEYS` | JSON dict, e.g. `{"default": "sb_secret_..."}` | current |

The new variables are **JSON objects keyed by name** (not plain strings like the old ones), because a project can have multiple secret keys. The auto-provisioned one is named `"default"` unless you've created additional named keys in Settings → API Keys.

## Required change to `createClient()`

Current code:
```ts
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

Needs to become:
```ts
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const SUPABASE_SECRET_KEY = SUPABASE_SECRET_KEYS['default']
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)
```

That's the whole change — parse the JSON dict, pull out the `"default"` entry, pass that string to `createClient` exactly where `SUPABASE_SERVICE_KEY` was passed before. No header overrides or `auth` option changes should be necessary as long as the `@supabase/supabase-js@2` version resolved from `esm.sh` is recent enough to recognize the `sb_secret_` prefix.

## Things to verify before changing anything

1. **Confirm the key actually exists and is named `default`.** Check Supabase dashboard → Settings → API Keys → confirm a secret key exists and note its exact name (it may not be `"default"` if it was renamed or multiple keys exist).
2. **Confirm the `@supabase/supabase-js` version supports the new key format.** The import is unpinned (`https://esm.sh/@supabase/supabase-js@2`), which should resolve to a current v2 release, but worth explicitly checking the changelog/release notes for the version actually resolved, since older v2.x releases predate the new key format and don't know to skip the `Authorization: Bearer` JWT path for `sb_secret_...` values.
3. **This client is also used elsewhere in the function** — for `.from('user_alert_criteria')`, `.from('polled_listings')` selects/inserts, in addition to `.auth.admin.listUsers()`. Since the secret key has the same (full/bypass-RLS) privilege level as `service_role`, none of those other calls should behave differently — but worth re-testing all of them once the key is swapped, not just the admin call that's currently erroring.
4. Recommended: keep this change isolated to the `createClient` construction; nothing else in the function needs to change for the migration itself.

## Sources
- [Migrating to publishable and secret API keys — Supabase Docs](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Understanding API keys — Supabase Docs](https://supabase.com/docs/guides/getting-started/api-keys)
- [Environment Variables — Supabase Docs (Edge Functions secrets)](https://supabase.com/docs/guides/functions/secrets)
- [Upcoming changes to Supabase API Keys · supabase discussion #29260](https://github.com/orgs/supabase/discussions/29260)
- [Use of new API keys: Changes needed? When? · supabase discussion #40300](https://github.com/orgs/supabase/discussions/40300)
