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
only when their credentials are present. Copy the root example file when
running locally:

```bash
cp ../../.env.example .env
```

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

IP2Location public lookup scraping is enabled by default. Set
`IP2LOCATION_HTML_LOOKUP_DISABLED=1` to disable it.

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
