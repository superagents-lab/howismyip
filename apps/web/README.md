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

Provider switches are shared across all sources. Empty means enabled; set a
switch to `0`, `false`, `no`, or `off` to disable that provider:

- `HOWISMYIP_PROVIDER_IP_API_ENABLED`
- `HOWISMYIP_PROVIDER_GEOJS_ENABLED`
- `HOWISMYIP_PROVIDER_RDAP_ENABLED`
- `HOWISMYIP_PROVIDER_CYMRU_ENABLED`
- `HOWISMYIP_PROVIDER_IP2LOCATION_ENABLED`
- `HOWISMYIP_PROVIDER_IPAPI_IS_ENABLED`
- `HOWISMYIP_PROVIDER_PROXYCHECK_ENABLED`
- `HOWISMYIP_PROVIDER_IPINFO_ENABLED`
- `HOWISMYIP_PROVIDER_SCAMALYTICS_ENABLED`
- `HOWISMYIP_PROVIDER_ABUSEIPDB_ENABLED`
- `HOWISMYIP_PROVIDER_IPQS_ENABLED`
- `HOWISMYIP_PROVIDER_IPDATA_ENABLED`
- `HOWISMYIP_PROVIDER_MAXMIND_ENABLED`

`HOWISMYIP_PROVIDER_TIMEOUT_MS` sets the shared per-provider timeout in
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
