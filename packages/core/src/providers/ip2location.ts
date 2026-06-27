import { riskLevelFromScore } from '../schema.js';
import type { IpIntelligence } from '../schema.js';
import { asDict, first, toInt, toStr, yesNoToBool } from './helpers.js';
import type { Env, IpProvider } from './types.js';

const IP2LOCATION_BASE_URL = 'https://www.ip2location.io';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const CODE_AND_DESCRIPTION_RE = /^\(([^)]+)\)\s*(.*)$/;
const COUNTRY_WITH_CODE_RE = /^(.*)\s+\(([A-Z]{2})\)$/;
const HTML_PAIR_RE =
  /<label\b[^>]*class=["'][^"']*\bmb-0\b[^"']*["'][^>]*>([\s\S]*?)<\/label>\s*<p\b[^>]*class=["'][^"']*\bip-result\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;

function cleanValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '));
}

function codeAndDescription(
  value: string | null | undefined
): [string | null, string | null] {
  const cleaned = cleanValue(value);
  if (!cleaned) {
    return [null, null];
  }
  const match = CODE_AND_DESCRIPTION_RE.exec(cleaned);
  if (!match) {
    return [null, cleaned];
  }
  return [match[1] ?? null, cleanValue(match[2] ?? null)];
}

function splitCountry(
  value: string | null | undefined
): [string | null, string | null] {
  const cleaned = cleanValue(value);
  if (!cleaned) {
    return [null, null];
  }
  const match = COUNTRY_WITH_CODE_RE.exec(cleaned);
  if (!match) {
    return [cleaned, null];
  }
  return [cleanValue(match[1] ?? null), match[2] ?? null];
}

function normalizeAsn(value: unknown): string | null {
  const asn = toStr(value);
  if (!asn) {
    return null;
  }
  return asn.toUpperCase().startsWith('AS') ? asn : `AS${asn}`;
}

function anyBoolean(values: unknown[]): boolean | null {
  let sawFalse = false;
  for (const value of values) {
    const bool = yesNoToBool(value);
    if (bool === true) {
      return true;
    }
    if (bool === false) {
      sawFalse = true;
    }
  }
  return sawFalse ? false : null;
}

function parseHtmlFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const match of html.matchAll(HTML_PAIR_RE)) {
    const label = cleanValue(stripTags(match[1] ?? ''));
    const value = cleanValue(stripTags(match[2] ?? ''));
    if (label && value) {
      fields[label] = value;
    }
  }
  return fields;
}

export function parseIp2LocationPayload(
  _ip: string,
  payload: Record<string, unknown>
): Partial<IpIntelligence> {
  const proxy = asDict(payload.proxy);
  const asInfo = asDict(payload.as_info);
  const continent = asDict(payload.continent);
  const region = asDict(payload.region);
  const city = asDict(payload.city);
  const usageType = toStr(payload.usage_type);
  const asUsageType = toStr(asInfo.as_usage_type);
  const score = toInt(payload.fraud_score);
  const proxyType = toStr(proxy.proxy_type);

  let isHosting = yesNoToBool(proxy.is_data_center);
  if (isHosting === null && usageType === 'DCH') {
    isHosting = true;
  }

  return {
    country_code: toStr(payload.country_code),
    country_name: toStr(payload.country_name),
    continent_code: toStr(continent.code),
    continent_name: toStr(continent.name),
    region: toStr(payload.region_name) ?? toStr(region.name),
    city: toStr(payload.city_name) ?? toStr(city.name),
    asn: normalizeAsn(first(asInfo, ['as_number', 'asn']) ?? payload.asn),
    as_domain: toStr(asInfo.as_domain) ?? toStr(payload.domain),
    isp: toStr(payload.isp),
    organization: toStr(payload.as) ?? toStr(asInfo.as_name),
    proxy_type: proxyType && proxyType !== '-' ? proxyType : usageType,
    usage_type: usageType,
    company_type: asUsageType,
    connection_type: toStr(payload.net_speed_name) ?? toStr(payload.net_speed),
    risk_score: score,
    risk_level: riskLevelFromScore(score),
    is_proxy: anyBoolean([
      payload.is_proxy,
      proxy.is_public_proxy,
      proxy.is_web_proxy,
    ]),
    is_vpn: yesNoToBool(proxy.is_vpn),
    is_tor: yesNoToBool(proxy.is_tor),
    is_hosting: isHosting,
    is_abuser: yesNoToBool(proxy.is_spammer),
    is_crawler: anyBoolean([
      proxy.is_web_crawler,
      proxy.is_scanner,
      proxy.is_botnet,
    ]),
    raw: payload,
  };
}

export function parseIp2LocationHtml(
  ip: string,
  html: string
): Partial<IpIntelligence> | null {
  const fields = parseHtmlFields(html);
  const [usageType, usageTypeName] = codeAndDescription(fields['Usage Type']);
  const [proxyType, proxyTypeName] = codeAndDescription(fields['Proxy Type']);
  const [netSpeed, netSpeedName] = codeAndDescription(fields['Net Speed']);
  const [adsCategory, adsCategoryName] = codeAndDescription(fields.Category);
  const [countryName, countryCode] = splitCountry(fields.Country);
  const isProxy = yesNoToBool(fields.Proxy);
  const isVpn = proxyType === 'VPN';
  const isTor = proxyType === 'TOR';
  const isDataCenter = usageType === 'DCH';

  const payload: Record<string, unknown> = {
    ip: fields['IP Address'] ?? ip,
    country_code: countryCode,
    country_name: countryName,
    region_name: fields.Region,
    district: fields.District,
    city_name: fields.City,
    zip_code: fields['ZIP Code'],
    time_zone: fields['Time Zone'],
    asn: fields.ASN,
    as: fields.AS,
    isp: fields.ISP,
    domain: fields.Domain,
    net_speed: netSpeed,
    net_speed_name: netSpeedName,
    usage_type: usageType,
    usage_type_name: usageTypeName,
    address_type: fields['Address Type'],
    ads_category: adsCategory,
    ads_category_name: adsCategoryName,
    is_proxy: isProxy,
    fraud_score: toInt(fields['Fraud Score']),
    proxy: {
      last_seen: fields['Last Seen'],
      proxy_type: proxyType ?? fields['Proxy Type'],
      proxy_type_name: proxyTypeName,
      threat: fields.Threat,
      provider: fields.Provider,
      is_vpn: isVpn,
      is_tor: isTor,
      is_data_center: isDataCenter,
      is_public_proxy: proxyType === 'PUB' || proxyType === 'WEB',
      is_web_proxy: proxyType === 'WEB',
      is_residential_proxy: proxyType === 'RES',
      is_consumer_privacy_network: proxyType === 'CPN',
      is_enterprise_private_network: proxyType === 'EPN',
    },
    raw_html_fields: fields,
    lookup_method: 'html_scrape',
  };

  const parsed = parseIp2LocationPayload(ip, payload);
  if (parsed.risk_score === null || !fields['IP Address']) {
    return null;
  }
  return parsed;
}

async function fetchIp2LocationHtml(ip: string, env: Env): Promise<string> {
  const delayMs = toInt(env.IP2LOCATION_HTML_DELAY_MS) ?? 0;
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${IP2LOCATION_BASE_URL}/${encodeURIComponent(ip)}`,
      {
        signal: controller.signal,
        headers: {
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': BROWSER_USER_AGENT,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * IP2Location.io public lookup page — no API key. This mirrors search1api's
 * HTML-scrape path so the app can display IP2Location's own fraud score and
 * proxy/VPN/datacenter flags without relying on paid API credentials.
 */
export const ip2locationProvider: IpProvider = {
  id: 'ip2location',
  name: 'IP2Location',
  category: 'risk',
  requiresKey: false,
  sourceUrl: (ip) => `${IP2LOCATION_BASE_URL}/${encodeURIComponent(ip)}`,
  isEnabled: (env) => env.IP2LOCATION_HTML_LOOKUP_DISABLED !== '1',
  async lookup(ip, env) {
    const html = await fetchIp2LocationHtml(ip, env);
    return parseIp2LocationHtml(ip, html);
  },
};
