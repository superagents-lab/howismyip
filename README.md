# howismyip

**Multi-source IP intelligence — one query, every angle.**

`whatismyip` tells you *what* your IP is. **howismyip** tells you *how* it is:
its reputation, risk, and provenance, cross-checked across many independent
sources at once. Is it a proxy / VPN / Tor / datacenter IP? Is it marked
as hosting, an abuser, or a crawler? What's its ASN, ISP, geolocation, owning
registry? Ask once, get every source's answer plus a transparent factual
summary.

Built with the **TanStack** full stack (Start + Router + server functions),
a geek/terminal aesthetic, English/中文 UI (URL-based, `/en` · `/zh`), and an
expandable risk-provider matrix that makes provider disagreement obvious. Ships
a **CLI** and a **Claude Code skill** so agents can call it. Open source (MIT).

> The whole point is **multiple data sources**. Any single provider can be
> wrong, rate-limited, or blind to a signal — agreement (and disagreement)
> across sources is the actual intelligence.

## Sources

Six sources run with **no API key** — clone, install, go:

| Source | Category | Provides |
| --- | --- | --- |
| ip-api.com | geo | country/city, ISP, ASN, proxy/hosting/mobile flags |
| GeoJS | network | geo + ASN (independent cross-check) |
| RDAP (rdap.org) | registry | RIR, allocated CIDR, registration date, abuse contact |
| Team Cymru | network | BGP-derived origin ASN, announced prefix, registry (via DoH) |
| IP2Location | risk | public lookup page scrape: fraud score, usage type, proxy/VPN/Tor/datacenter flags |
| ipapi.is | risk | abuse score, ASN/company type, proxy/VPN/Tor/datacenter/abuser/crawler flags |

Seven more activate automatically **when you provide an API key**. For the web
app, use [`apps/web/.env.example`](apps/web/.env.example) as the local template:

| Source | Env | Provides |
| --- | --- | --- |
| proxycheck.io | `PROXYCHECK_API_KEY` | fraud/risk score + proxy/VPN flags |
| IPinfo Lite | `IPINFO_TOKEN` | country + ASN attribution |
| Scamalytics | `SCAMALYTICS_API_URL`, `SCAMALYTICS_API_KEY` | fraud score |
| AbuseIPDB | `ABUSEIPDB_API_KEY` | community abuse confidence score |
| IPQualityScore | `IPQS_API_KEY` | proxy/VPN/fraud detection |
| ipdata.co | `IPDATA_API_KEY` | threat block + asn.type (isp/hosting) |
| MaxMind minFraud | `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY` | official minFraud `ip_address.risk` score + returned traits |

Notes:

- The app deliberately does **not** compute a composite score and does **not**
  weight providers. Scores and flags stay attached to the source that returned
  them.
- The basic facts panel shows factual fields such as country, city, ASN, ISP,
  and organization with source counts and expandable source lists. It is not a
  risk score.
- IP2Location is keyless here because it scrapes the public lookup page rather
  than calling the paid API.
- The optional `MaxMind minFraud` provider uses MaxMind's official API and is
  treated as a risk source only when credentials are configured.

Provider runtime is configured with three optional variables — the defaults
just work (keyless sources on; keyed sources on whenever their credentials
are present). Provider ids are used verbatim (`ip-api`, `ipapi-is`, …):

- `HOWISMYIP_DISABLED_PROVIDERS` — comma-separated ids to turn off, e.g.
  `geojs,ip2location`.
- `HOWISMYIP_DAILY_BUDGETS` — call caps per provider for hosted deployments
  running providers on limited plans, e.g. `proxycheck:900,ipqs:900` (`0` =
  never call). Each provider resets on **its own** real billing cycle, not
  always daily: most reset per UTC day; a few (IPQualityScore, Scamalytics,
  IPinfo Lite) meter monthly and reset per UTC calendar month instead; MaxMind
  is a prepaid balance that never resets on its own — raise its number
  yourself after a manual top-up. A provider whose budget is spent for its
  current period is reported as status `skipped` (shown as "quota exhausted"
  in the UI) until the reset. Enforced by a Durable Object on the Cloudflare
  deployment; ignored elsewhere.
- `HOWISMYIP_PROVIDER_TIMEOUT_MS` — shared per-provider timeout. The default
  is `10000`.

### Abuse protection (hosted deployments)

The web app ships with layered protection so a public instance can't be
farmed dry:

- **Per-client rate limit** (Cloudflare Rate Limiting binding, 20 req/min per
  IP) on the JSON API *and* the server functions behind the UI.
- **Edge cache** keyed by the RFC 5952-normalized IP (6 h TTL), so repeat
  lookups and textual IPv6 variants don't re-hit providers.
- **Per-provider daily budgets** (above) as the last line of defense against
  distributed traffic.

All three fail open: on runtimes without the Cloudflare bindings (local dev,
other hosts) lookups simply run unprotected.

## Quick start

```bash
pnpm install
pnpm build            # builds packages/core (required before web/cli run)
pnpm dev              # web app at http://localhost:3000
```

Optional paid sources:

```bash
cp apps/web/.env.example apps/web/.env   # fill in any keys you have
```

## Four ways to use it

**1. Web app** — a terminal-styled UI. Search any IP or scan your own; see the
factual source summary and an expandable per-provider risk matrix, with a
raw-JSON / copy-as-curl toggle.

**2. JSON API** — what the CLI and agents call:

```bash
curl http://localhost:3000/api/ip/8.8.8.8   # look up an IP
curl http://localhost:3000/api/me            # look up the caller's IP
```

**3. CLI** — `@howismyip/cli`, the `howismyip` command:

```bash
howismyip 8.8.8.8            # colored summary
howismyip 8.8.8.8 --json     # raw aggregated JSON
howismyip                    # your own public IP

# Local paid provider keys are read from shell environment variables:
export PROXYCHECK_API_KEY=...
howismyip 8.8.8.8

# Point at a deployed instance (uses its configured paid sources):
HOWISMYIP_BASE_URL=https://your-instance howismyip 8.8.8.8
```

By default the CLI runs the keyless sources locally — no server needed. The CLI
does not read the web app's `.env`; use shell `export` for now, with a
user-level config file planned for later.

**4. Agent skill** — [`skills/howismyip`](skills/howismyip/SKILL.md) is a Claude
Code skill wrapping the CLI, so agents can vet IPs across sources on demand.

## Architecture

A small pnpm workspace. The aggregation logic lives in framework-free
`packages/core`, shared by both the web app and the CLI (one source of truth):

```
packages/core   # provider adapters, normalization, consensus (zero deps)
packages/cli    # the `howismyip` command, imports core
apps/web        # TanStack Start app + public JSON API, imports core
skills/howismyip# Claude Code skill (SKILL.md) wrapping the CLI
```

Each provider is an adapter that normalizes one upstream API into a shared
`IpIntelligence` shape. The aggregator runs every enabled provider concurrently
(`Promise.allSettled`), never failing the whole report on one provider's error,
and groups factual fields by value and source. Risk score, proxy/VPN/Tor,
hosting, abuser, crawler, type, and reason signals stay per-source — agreement
and disagreement across sources is shown, never collapsed into one number.
Adding a source = one new adapter.

The service keeps **no database** — lookups are served live or from a
short-lived edge cache; the only durable state is the per-provider daily
quota counter (a Durable Object) on hosted deployments.
`packages/core` has **zero runtime dependencies** and is runtime-agnostic: it
uses only `fetch` (DNS lookups go over DNS-over-HTTPS, not `node:dns`), so it
runs on Node, Bun, Deno, and Cloudflare Workers alike.

## Deploy (Cloudflare Workers)

`apps/web` is configured for Cloudflare Workers via `@cloudflare/vite-plugin`
and [`wrangler.jsonc`](apps/web/wrangler.jsonc).

```bash
cd apps/web
pnpm dlx wrangler login                       # once
# set each paid-source key as a Worker secret (skip any you don't use):
echo "$PROXYCHECK_API_KEY" | pnpm dlx wrangler secret put PROXYCHECK_API_KEY
# … IPINFO_TOKEN, SCAMALYTICS_API_URL, SCAMALYTICS_API_KEY,
#    ABUSEIPDB_API_KEY, IPQS_API_KEY, IPDATA_API_KEY,
#    MAXMIND_ACCOUNT_ID, MAXMIND_LICENSE_KEY
pnpm run deploy                               # build + wrangler deploy
```

The six keyless sources work with no secrets. To serve a custom domain, add it
to your Cloudflare account and set a route in `wrangler.jsonc`.

**Git-connected deploys (Cloudflare Workers Builds):** this repo is a pnpm
monorepo, so if you connect it for automatic build-on-push deploys, set the
Worker's **Root directory to `apps/web`** — that's where `wrangler.jsonc`
lives, and both the build and deploy commands run from that directory.
Leave the build/deploy/version commands at their defaults (`pnpm run build`,
`npx wrangler deploy`, `npx wrangler versions upload`); `apps/web`'s own
build script already builds its `packages/core` dependency first. Scope the
build watch paths to `apps/web/**` and `packages/core/**` so unrelated
changes elsewhere in the monorepo (e.g. `packages/cli`) don't trigger a
rebuild.

## Development

```bash
pnpm -r build     # build every package
pnpm -r test      # run unit tests (core + web)
pnpm check        # biome lint/format for the whole repo
pnpm format       # same, applying safe fixes
```

## Sponsor

howismyip is sponsored by
**[Search1API](https://www.search1api.com/proxies/static-isp?utm_source=howismyip&utm_medium=referral&utm_campaign=static_isp&utm_content=readme_sponsor)**,
which provides customizable static ISP proxies that you can filter for zero
fraud scores from the IP intelligence providers you trust.

Sponsorship does not influence howismyip's results: provider signals remain
source-specific, and the project does not compute a composite score or turn a
lookup result into a purchase recommendation.

## License

MIT
