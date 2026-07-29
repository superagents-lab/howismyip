const GA_SCRIPT_ID = "howismyip-google-analytics";
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

type Gtag = (...args: unknown[]) => void;

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: Gtag;
		__howismyipGaMeasurementId?: string;
		__howismyipGaLastPagePath?: string;
		__howismyipPendingLookup?: PendingLookup;
	}
}

export type LookupMode = "manual" | "self" | "direct";
export type LookupIpVersion = "ipv4" | "ipv6" | "unknown";
export type LookupOutcome =
	| "success"
	| "invalid"
	| "failed"
	| "rate_limited"
	| "private"
	| "undetectable";
export type LookupCacheStatus = "HIT" | "MISS" | "BYPASS" | null;

interface PendingLookup {
	startedAt: number;
	mode: LookupMode;
	ipVersion: LookupIpVersion;
}

export interface LookupProviderTiming {
	id: string;
	status: "ok" | "empty" | "error" | "skipped";
	durationMs: number;
	error: string | null;
}

export interface LookupStarted {
	mode: LookupMode;
	ipVersion: LookupIpVersion;
}

export interface LookupCompleted {
	outcome: LookupOutcome;
	ipVersion?: LookupIpVersion;
	cacheStatus?: LookupCacheStatus;
	serverDurationMs?: number;
	providers?: LookupProviderTiming[];
}

export interface RelatedProductClick {
	product: string;
	placement: string;
	destination: string;
	language?: string;
}

export interface AnalyticsPageContext {
	page_location: string;
	page_path: string;
	page_title: string;
}

export function isGaMeasurementId(value: string | undefined): value is string {
	return GA_MEASUREMENT_ID_PATTERN.test(value ?? "");
}

export function inferIpVersion(
	value: string | null | undefined,
): LookupIpVersion {
	const trimmed = value?.trim() ?? "";
	if (trimmed.includes(":")) return "ipv6";
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return "ipv4";
	return "unknown";
}

/**
 * Keeps GA page context useful without sending a queried IP (or arbitrary
 * query/hash values) to Google.
 */
export function getAnalyticsPageContext(
	routeHref: string,
	win: Window = window,
	doc: Document = document,
): AnalyticsPageContext {
	const location = new URL(routeHref, win.location.origin);
	const isIpReport = /^\/(en|zh)\/[^/]+\/?$/.test(location.pathname);
	const pagePath = isIpReport
		? location.pathname.replace(/\/[^/]+\/?$/, "/:ip")
		: location.pathname;

	return {
		page_location: new URL(pagePath, location.origin).href,
		page_path: pagePath,
		page_title: isIpReport ? "IP report · howismyip" : doc.title,
	};
}

/**
 * Adds GA4 after hydration and configures manual page-view collection.
 * Returns false when the ID is missing/invalid or another property was already
 * configured on this page.
 */
export function initializeGoogleAnalytics(
	measurementId: string | undefined,
	win: Window = window,
	doc: Document = document,
): boolean {
	if (!isGaMeasurementId(measurementId)) return false;

	if (win.__howismyipGaMeasurementId) {
		return win.__howismyipGaMeasurementId === measurementId;
	}

	win.dataLayer = win.dataLayer ?? [];
	win.gtag =
		win.gtag ??
		function gtag() {
			// Google tag commands must retain the array-like `arguments` shape
			// used by the official snippet; a regular Array is ignored.
			// biome-ignore lint/complexity/noArguments: required by the Google tag command protocol
			win.dataLayer?.push(arguments);
		};

	win.__howismyipGaMeasurementId = measurementId;
	win.gtag("js", new Date());
	win.gtag("config", measurementId, {
		send_page_view: false,
		...getAnalyticsPageContext(win.location.href, win, doc),
	});

	if (!doc.getElementById(GA_SCRIPT_ID)) {
		const script = doc.createElement("script");
		script.id = GA_SCRIPT_ID;
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
		doc.head.appendChild(script);
	}

	return true;
}

/** Sends one GA4 page_view for each distinct SPA path. */
export function trackPageView(
	routeHref: string,
	win: Window = window,
	doc: Document = document,
): boolean {
	if (!win.gtag || !win.__howismyipGaMeasurementId) return false;

	const location = new URL(routeHref, win.location.origin);
	const routeKey = `${location.pathname}${location.search}${location.hash}`;
	if (win.__howismyipGaLastPagePath === routeKey) return false;

	win.__howismyipGaLastPagePath = routeKey;
	win.gtag("event", "page_view", {
		...getAnalyticsPageContext(location.href, win, doc),
	});
	return true;
}

/**
 * Starts an in-memory lookup timer and sends a low-cardinality GA4 event.
 * The queried IP is deliberately not retained or sent.
 */
export function trackLookupStarted(
	lookup: LookupStarted,
	win: Window = window,
	doc: Document = document,
	now = win.performance.now(),
): boolean {
	win.__howismyipPendingLookup = {
		startedAt: now,
		mode: lookup.mode,
		ipVersion: lookup.ipVersion,
	};

	if (!win.gtag || !win.__howismyipGaMeasurementId) return false;
	win.gtag("event", "ip_lookup_started", {
		lookup_mode: lookup.mode,
		ip_version: lookup.ipVersion,
		...getAnalyticsPageContext(win.location.href, win, doc),
	});
	return true;
}

/** Starts a direct-route timer without replacing a click/scan timer. */
export function ensureLookupStarted(
	lookup: LookupStarted,
	win: Window = window,
	doc: Document = document,
	now = win.performance.now(),
): boolean {
	if (win.__howismyipPendingLookup) return false;
	return trackLookupStarted(lookup, win, doc, now);
}

/**
 * Completes the current lookup timer after the result has rendered. Provider
 * errors are summarized into counts; raw errors and queried IPs stay local.
 */
export function trackLookupCompleted(
	lookup: LookupCompleted,
	win: Window = window,
	doc: Document = document,
	now = win.performance.now(),
): boolean {
	const pending = win.__howismyipPendingLookup;
	if (!pending) return false;
	win.__howismyipPendingLookup = undefined;

	if (!win.gtag || !win.__howismyipGaMeasurementId) return false;

	const providers = lookup.providers ?? [];
	let slowest: LookupProviderTiming | null = null;
	let okCount = 0;
	let errorCount = 0;
	let skippedCount = 0;
	let timeoutCount = 0;
	for (const provider of providers) {
		if (provider.status === "ok") okCount += 1;
		if (provider.status === "error") {
			errorCount += 1;
			if (/timeout|timed out/i.test(provider.error ?? "")) {
				timeoutCount += 1;
			}
		}
		if (provider.status === "skipped") skippedCount += 1;
		if (
			provider.status !== "skipped" &&
			(!slowest || provider.durationMs > slowest.durationMs)
		) {
			slowest = provider;
		}
	}

	win.gtag("event", "ip_lookup_completed", {
		lookup_mode: pending.mode,
		ip_version:
			lookup.ipVersion && lookup.ipVersion !== "unknown"
				? lookup.ipVersion
				: pending.ipVersion,
		outcome: lookup.outcome,
		duration_ms: Math.max(0, Math.round(now - pending.startedAt)),
		cache_status: lookup.cacheStatus?.toLowerCase() ?? "unknown",
		provider_total: providers.length,
		provider_ok: okCount,
		provider_error: errorCount,
		provider_skipped: skippedCount,
		provider_timeout: timeoutCount,
		...(lookup.serverDurationMs === undefined
			? {}
			: {
					server_duration_ms: Math.max(0, Math.round(lookup.serverDurationMs)),
				}),
		...(slowest
			? {
					slowest_provider: slowest.id,
					slowest_provider_ms: Math.max(0, Math.round(slowest.durationMs)),
				}
			: {}),
		...getAnalyticsPageContext(win.location.href, win, doc),
	});
	return true;
}

/** Conversion-oriented event for links from howismyip to related products. */
export function trackRelatedProductClick(
	click: RelatedProductClick,
	win: Window = window,
	doc: Document = document,
): boolean {
	if (!win.gtag || !win.__howismyipGaMeasurementId) return false;

	win.gtag("event", "related_product_click", {
		product: click.product,
		placement: click.placement,
		link_url: click.destination,
		language: click.language,
		...getAnalyticsPageContext(win.location.href, win, doc),
	});
	return true;
}
