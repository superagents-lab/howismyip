import {
	ALL_PROVIDERS,
	enabledProviders,
	InvalidIpError,
	type IpReport,
	isPrivateOrReserved,
	isValidIp,
	lookupIp,
	type ProviderCategory,
} from "@howismyip/core";
import { createServerFn } from "@tanstack/react-start";
import { detectClientIp } from "./client-ip.server";

// NOTE: every value imported from `@howismyip/core` (which pulls in node:dns)
// is used ONLY inside server-function handlers below, so the TanStack Start
// build strips it from the client bundle. Keep it that way — do not reference
// core runtime from module top-level or from a non-handler export.

/** Error codes are translated client-side so the UI can localize them. */
export type LookupErrorCode = "invalid" | "failed";

export interface LookupResult {
	report: IpReport | null;
	errorCode: LookupErrorCode | null;
}

/** Server function used by route loaders to look up an arbitrary IP (SSR). */
export const lookupIpFn = createServerFn({ method: "GET" })
	.validator((ip: unknown) => String(ip ?? "").trim())
	.handler(async ({ data }): Promise<LookupResult> => {
		try {
			return { report: await lookupIp(data), errorCode: null };
		} catch (err) {
			return {
				report: null,
				errorCode: err instanceof InvalidIpError ? "invalid" : "failed",
			};
		}
	});

export interface SelfLookup {
	ip: string | null;
	report: IpReport | null;
	/** Set when an IP was detected but isn't publicly routable (local dev, LAN). */
	reason: "private" | "undetectable" | null;
}

/** Our egress IP via a public echo service — the fallback when request headers
 *  don't carry a usable public IP (local dev, missing proxy headers). */
export async function fetchEgressIp(): Promise<string | null> {
	try {
		const res = await fetch("https://api.ipify.org?format=json");
		if (!res.ok) {
			return null;
		}
		const data = (await res.json()) as { ip?: string };
		return data.ip && isValidIp(data.ip) ? data.ip : null;
	} catch {
		return null;
	}
}

/** Server function for "scan my own IP" — resolves the caller's public IP.
 *  Prefers proxy/request headers; falls back to egress detection (ipify) so it
 *  still returns a real public IP in local dev where headers give only ::1. */
export const lookupSelfFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<SelfLookup> => {
		const headerIp = await detectClientIp();
		let ip =
			headerIp && isValidIp(headerIp) && !isPrivateOrReserved(headerIp)
				? headerIp
				: null;
		if (!ip) {
			ip = await fetchEgressIp();
		}
		if (!ip) {
			return {
				ip: headerIp ?? null,
				report: null,
				reason: headerIp ? "private" : "undetectable",
			};
		}
		return { ip, report: await lookupIp(ip), reason: null };
	},
);

export interface ProviderInfo {
	id: string;
	name: string;
	category: ProviderCategory;
	requiresKey: boolean;
	enabled: boolean;
}

/** Server function listing every provider and whether it's active in this env. */
export const listProvidersFn = createServerFn({ method: "GET" }).handler(
	(): Promise<ProviderInfo[]> => {
		const active = new Set(enabledProviders(process.env).map((p) => p.id));
		return Promise.resolve(
			ALL_PROVIDERS.map((p) => ({
				id: p.id,
				name: p.name,
				category: p.category,
				requiresKey: p.requiresKey,
				enabled: active.has(p.id),
			})),
		);
	},
);
