import { abuseipdbProvider } from './abuseipdb.js';
import { isProviderEnabled } from './config.js';
import { cymruProvider } from './cymru.js';
import { geojsProvider } from './geojs.js';
import { ipApiProvider } from './ip-api.js';
import { ip2locationProvider } from './ip2location.js';
import { ipapiIsProvider } from './ipapi-is.js';
import { ipdataProvider } from './ipdata.js';
import { ipinfoProvider } from './ipinfo.js';
import { ipqsProvider } from './ipqs.js';
import { maxmindProvider } from './maxmind.js';
import { proxycheckProvider } from './proxycheck.js';
import { rdapProvider } from './rdap.js';
import { scamalyticsProvider } from './scamalytics.js';
import type { Env, IpProvider } from './types.js';

/** Keyless providers — enabled by default, zero configuration. */
export const KEYLESS_PROVIDERS: IpProvider[] = [
  ipApiProvider,
  geojsProvider,
  rdapProvider,
  cymruProvider,
  ip2locationProvider,
  ipapiIsProvider,
];

/** Keyed providers — enabled by default, but only run when credentials exist. */
export const KEYED_PROVIDERS: IpProvider[] = [
  proxycheckProvider,
  ipinfoProvider,
  scamalyticsProvider,
  abuseipdbProvider,
  ipqsProvider,
  ipdataProvider,
  maxmindProvider,
];

/** Every known provider, keyless first. */
export const ALL_PROVIDERS: IpProvider[] = [
  ...KEYLESS_PROVIDERS,
  ...KEYED_PROVIDERS,
];

/** Providers that should actually run for the given environment. */
export function enabledProviders(env: Env): IpProvider[] {
  return ALL_PROVIDERS.filter((p) => isProviderEnabled(p, env));
}

export type { Env, IpProvider } from './types.js';
