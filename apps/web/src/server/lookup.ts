import {
	ALL_PROVIDERS,
	enabledProviders,
	InvalidIpError,
	type IpReport,
	isPrivateOrReserved,
	isValidIp,
	type ProviderCategory,
} from "@howismyip/core";
import { createServerFn } from "@tanstack/react-start";
import { detectClientIp } from "./client-ip.server";
import { cachedLookup } from "./lookup-cache";
import { isRateLimited } from "./rate-limit.server";

// NOTE: every value imported from `@howismyip/core` (which pulls in node:dns)
// is used ONLY inside server-function handlers below, so the TanStack Start
// build strips it from the client bundle. Keep it that way — do not reference
// core runtime from module top-level or from a non-handler export.

// These server functions are exposed by TanStack Start as public `/_serverFn/`
// HTTP endpoints, so they share the SAME rate limit + cache pipeline as the
// JSON API routes — otherwise they'd be an unmetered bypass around both.

/** Error codes are translated client-side so the UI can localize them. */
export type LookupErrorCode = "invalid" | "failed" | "rateLimited";

export interface LookupResult {
	report: IpReport | null;
	errorCode: LookupErrorCode | null;
}

/** Server function used by route loaders to look up an arbitrary IP (SSR). */
export const lookupIpFn = createServerFn({ method: "GET" })
	.validator((ip: unknown) => String(ip ?? "").trim())
	.handler(async ({ data }): Promise<LookupResult> => {
		if (await isRateLimited()) {
			return { report: null, errorCode: "rateLimited" };
		}
		try {
			const { report } = await cachedLookup(data);
			return { report, errorCode: null };
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
	/** Set when an IP was detected but isn't publicly routable (local dev, LAN),
	 *  or when the caller is over the per-client rate limit. */
	reason: "private" | "undetectable" | "rateLimited" | null;
}

/** Our egress IP via a public echo service — the fallback when request headers
 *  don't carry a usable public IP. Dev-only: it reports the *server's* IP,
 *  which equals the caller's only when both are the same machine (local dev).
 *  In production it would silently show the Worker's egress IP to every
 *  visitor, so there we fail the lookup instead. */
export async function fetchEgressIp(): Promise<string | null> {
	if (!import.meta.env.DEV) {
		return null;
	}
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
 *  Prefers proxy/request headers; in local dev (where headers give only ::1)
 *  falls back to egress detection, which is a no-op in production. */
export const lookupSelfFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<SelfLookup> => {
		if (await isRateLimited()) {
			return { ip: null, report: null, reason: "rateLimited" };
		}
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
		const { report } = await cachedLookup(ip);
		return { ip, report, reason: null };
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
