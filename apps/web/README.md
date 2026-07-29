# @howismyip/web

TanStack Start web app for **howismyip**.

The app exposes the terminal-styled browser UI and the public JSON API:

- `/en` and `/zh` route-localized UI
- `/en/:ip` and `/zh/:ip` IP report pages
- `/api/ip/:ip` aggregated IP intelligence JSON
- `/api/me` lookup for the caller's public IP

The provider aggregation logic lives in `packages/core`; this app imports that
package rather than implementing provider behavior locally.

## Development

From the repository root:

```bash
pnpm install
pnpm build
pnpm dev
```

The dev server listens on:

```text
http://localhost:3000
```

From this package directory:

```bash
pnpm run dev
pnpm run build
pnpm run typecheck
pnpm run test
```

## Environment

Keyless providers run without configuration. Optional paid providers activate
only when their credentials are present. Copy the local template when running
the web app locally:

```bash
cp .env.example .env
```

The local dev server reads `.env` from this directory. The CLI does not read
this file; use shell environment variables for CLI lookups.

To enable Google Analytics 4 in production, set
`VITE_GA_MEASUREMENT_ID=G-...`. This is a public, build-time value rather than
a Worker secret. Local/manual builds read it from `.env`; for Cloudflare
Workers Builds, add it as a build variable. The app does not load Google's
script in development or when this value is absent.

GA4 receives privacy-safe `ip_lookup_started` and `ip_lookup_completed` events
for user-perceived lookup timing. Event parameters include the lookup mode,
IP version, outcome, cache status, provider counts, and duration, but never the
queried IP or its unsanitized report URL. Cloudflare Workers Logs separately
receive one structured `ip_lookup_completed` object per cached lookup call for
server duration and upstream-provider diagnosis; those objects also exclude IP
addresses, provider URLs, and raw error messages.

Common optional secrets:

- `PROXYCHECK_API_KEY`
- `IPINFO_TOKEN`
- `SCAMALYTICS_API_URL`
- `SCAMALYTICS_API_KEY`
- `ABUSEIPDB_API_KEY`
- `IPQS_API_KEY`
- `IPDATA_API_KEY`
- `MAXMIND_ACCOUNT_ID`
- `MAXMIND_LICENSE_KEY`

Three optional variables tune the runtime; provider ids are used verbatim
(`ip-api`, `geojs`, `rdap`, `cymru`, `ripestat`, `ip2location`, `ipapi-is`,
`proxycheck`, `ipinfo`, `scamalytics`, `abuseipdb`, `ipqs`, `ipdata`,
`maxmind`):

- `HOWISMYIP_DISABLED_PROVIDERS` — comma-separated ids to turn off, e.g.
  `geojs,ip2location`. Everything else stays enabled by default.
- `HOWISMYIP_DAILY_BUDGETS` — per-provider call caps for hosted deployments,
  e.g. `ripestat:100,proxycheck:900,ipqs:900`. Each provider resets on its own
  real billing cycle (day/month/prepaid lifetime), not always daily — see the
  root README.
- `HOWISMYIP_PROVIDER_TIMEOUT_MS` — shared per-provider timeout in
  milliseconds. The default is `10000`.

## Deployment

This package is configured for Cloudflare Workers through
`@cloudflare/vite-plugin` and `wrangler.jsonc`.

```bash
pnpm dlx wrangler login
pnpm dlx wrangler secret put PROXYCHECK_API_KEY
pnpm dlx wrangler secret put IPINFO_TOKEN
pnpm dlx wrangler secret put SCAMALYTICS_API_URL
pnpm dlx wrangler secret put SCAMALYTICS_API_KEY
pnpm dlx wrangler secret put ABUSEIPDB_API_KEY
pnpm dlx wrangler secret put IPQS_API_KEY
pnpm dlx wrangler secret put IPDATA_API_KEY
pnpm dlx wrangler secret put MAXMIND_ACCOUNT_ID
pnpm dlx wrangler secret put MAXMIND_LICENSE_KEY
pnpm run deploy
```

Skip any provider secret you do not use.

**Git-connected deploys (Cloudflare Workers Builds):** the repo is a pnpm
monorepo — `wrangler.jsonc` lives in this directory, not the repo root — so
the Worker's **Root directory must be set to `apps/web`**. Otherwise
`wrangler deploy` runs from the workspace root, can't find a Worker to
target, and fails with "The Cloudflare application detection logic has been
run in the root of a workspace". Build/deploy/version commands can stay at
their defaults; this package's own `build` script already builds
`packages/core` first regardless of which directory it's invoked from.
