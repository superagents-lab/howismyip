---
name: howismyip
description: >-
  Check an IP address's reputation, quality, and risk by aggregating many data
  sources at once — is it a proxy / VPN / Tor exit / hosting/datacenter IP, what
  is its ASN, ISP, geolocation, and owning registry (RIR), and is it on any DNS
  blocklists. Use whenever the user asks about an IP's reputation or risk/fraud
  score, whether an IP is a proxy/VPN/Tor, IP geolocation, ASN/ISP lookup, who
  owns an IP range, or wants to vet a suspicious address. Also triggers on a
  bare IPv4/IPv6 address when the intent is to investigate it. Works keyless out
  of the box; more sources activate when the deployment has API keys.
---

# howismyip

Aggregate IP intelligence from many independent sources into one normalized
report. Six sources run with **no API key**: ip-api.com (geo + proxy/hosting
flags), ipwho.is (geo + ASN), RDAP (registry allocation + abuse contact),
Team Cymru (BGP/ASN), the Tor exit list, and DNS blocklists. Paid sources
(proxycheck, IPinfo, Scamalytics, AbuseIPDB, IPQualityScore) join automatically
when keys are configured.

## When to use

- "Is `X.X.X.X` a VPN / proxy / Tor / datacenter IP?"
- "What's the reputation / risk / fraud score of this IP?"
- "Where is this IP / what ASN / ISP / who owns it?"
- "Is this IP on any blocklists?"
- The user pastes a bare IP and wants it investigated.

## How to run

```bash
# Human-readable summary (one IP)
howismyip 8.8.8.8

# Machine-readable JSON — parse this when you need to reason over fields
howismyip 8.8.8.8 --json

# The caller's own public IP (omit the argument)
howismyip
```

If the `howismyip` binary isn't on PATH, run it directly from the repo after a
build (`pnpm --filter @howismyip/cli build`):

```bash
node /path/to/howismyip/packages/cli/dist/bin.js 8.8.8.8 --json
```

To query a deployed instance (and use any paid sources configured there) set
`HOWISMYIP_BASE_URL`, or just hit the JSON API directly:

```bash
HOWISMYIP_BASE_URL=https://your-instance.example howismyip 8.8.8.8 --json
curl https://your-instance.example/api/ip/8.8.8.8
```

## Interpreting the JSON

```jsonc
{
  "ip": "8.8.8.8",
  "consensus": {
    "country_name": "United States",
    "asn": "AS15169",
    "isp": "Google LLC",
    "rir": "ARIN",
    "blocklists": [],           // names of lists the IP appears on
    "source_count": 5           // how many sources returned data
  },
  "sources": [ /* per-source records with status, timing, and raw payload */ ]
}
```

Guidance for answering:
- There is no composite risk score — report each source's own score/flags and
  call out where sources disagree. Disagreement between sources is itself signal.
- `null` flags mean "unknown", not "false". Say so rather than asserting safety.
- A `source` with `status: "error"` failed (rate limit, network); note reduced
  confidence if many failed. `source_count` tells you how many actually agreed.
- `blocklists` being non-empty is a strong negative signal worth surfacing.
