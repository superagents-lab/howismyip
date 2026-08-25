const GA_SCRIPT_ID = "howismyip-google-analytics";
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

const UMAMI_SCRIPT_ID = "howismyip-umami";
const UMAMI_SCRIPT_SRC = "https://umami.fatwang2.com/script.js";
const UMAMI_WEBSITE_ID = "e1996d0f-604d-4a79-a0ff-00b5afd627ec";
const UMAMI_WEBSITE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Gtag = (...args: unknown[]) => void;

type UmamiTrackPayload = Record<string, unknown>;
type UmamiTrack = {
	(payload?: UmamiTrackPayload): void;
	(
		payload: (
			props: UmamiTrackPayload,
		) => UmamiTrackPayload | false | null | undefined,
	): void;
	(eventName: string, data?: Record<string, unknown>): void;
};

type UmamiQueuedCommand =
	| {
			kind: "pageview";
			url: string;
			title: string;
	  }
	| {
			kind: "event";
			name: string;
			url: string;
			title: string;
			data: Record<string, unknown>;
	  };

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: Gtag;
		umami?: { track: UmamiTrack };
		__howismyipGaMeasurementId?: string;
		__howismyipGaLastPagePath?: string;
		__howismyipUmamiWebsiteId?: string;
		__howismyipUmamiLastPagePath?: string;
		__howismyipUmamiQueue?: UmamiQueuedCommand[];
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

export function isUmamiWebsiteId(value: string | undefined): value is string {
	return UMAMI_WEBSITE_ID_PATTERN.test(value ?? "");
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
 * Keeps analytics page context useful without sending a queried IP (or arbitrary
 * query/hash values) to third-party trackers.
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

function routeKeyFor(routeHref: string, win: Window): string {
	const location = new URL(routeHref, win.location.origin);
	return `${location.pathname}${location.search}${location.hash}`;
}

function runUmamiCommand(win: Window, command: UmamiQueuedCommand): boolean {
	const track = win.umami?.track;
	if (!track) return false;

	if (command.kind === "pageview") {
		track((props) => ({
			...props,
			url: command.url,
			title: command.title,
		}));
		return true;
	}

	track((props) => ({
		...props,
		name: command.name,
		url: command.url,
		title: command.title,
		data: command.data,
	}));
	return true;
}

function flushUmamiQueue(win: Window): void {
	const queue = win.__howismyipUmamiQueue;
	if (!queue?.length || !win.umami?.track) return;
	win.__howismyipUmamiQueue = [];
	for (const command of queue) {
		runUmamiCommand(win, command);
	}
}

function enqueueUmami(win: Window, command: UmamiQueuedCommand): boolean {
	if (!win.__howismyipUmamiWebsiteId) return false;
	if (runUmamiCommand(win, command)) return true;
	win.__howismyipUmamiQueue = win.__howismyipUmamiQueue ?? [];
	win.__howismyipUmamiQueue.push(command);
	return true;
}

function trackUmamiPageView(
	context: AnalyticsPageContext,
	win: Window,
): boolean {
	return enqueueUmami(win, {
		kind: "pageview",
		url: context.page_path,
		title: context.page_title,
	});
}

function trackUmamiEvent(
	name: string,
	data: Record<string, unknown>,
	context: AnalyticsPageContext,
	win: Window,
): boolean {
	return enqueueUmami(win, {
		kind: "event",
		name,
		url: context.page_path,
		title: context.page_title,
		data,
	});
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

/**
 * Loads the Umami tracker with automatic pageviews disabled so SPA routes can
 * send privacy-safe URLs (IP report paths redacted to `/:ip`).
 */
export function initializeUmami(
	websiteId: string | undefined = UMAMI_WEBSITE_ID,
	scriptSrc: string = UMAMI_SCRIPT_SRC,
	win: Window = window,
	doc: Document = document,
): boolean {
	if (!isUmamiWebsiteId(websiteId)) return false;

	if (win.__howismyipUmamiWebsiteId) {
		return win.__howismyipUmamiWebsiteId === websiteId;
	}

	win.__howismyipUmamiWebsiteId = websiteId;
	win.__howismyipUmamiQueue = win.__howismyipUmamiQueue ?? [];

	if (!doc.getElementById(UMAMI_SCRIPT_ID)) {
		const script = doc.createElement("script");
		script.id = UMAMI_SCRIPT_ID;
		script.defer = true;
		script.src = scriptSrc;
		script.dataset.websiteId = websiteId;
		script.dataset.autoPageview = "false";
		script.addEventListener("load", () => {
			flushUmamiQueue(win);
		});
		doc.head.appendChild(script);
	} else {
		flushUmamiQueue(win);
	}

	return true;
}

/** Sends one page_view to each configured tracker for each distinct SPA path. */
export function trackPageView(
	routeHref: string,
	win: Window = window,
	doc: Document = document,
): boolean {
	const location = new URL(routeHref, win.location.origin);
	const routeKey = routeKeyFor(routeHref, win);
	const context = getAnalyticsPageContext(location.href, win, doc);
	let sent = false;

	if (win.gtag && win.__howismyipGaMeasurementId) {
		if (win.__howismyipGaLastPagePath !== routeKey) {
			win.__howismyipGaLastPagePath = routeKey;
			win.gtag("event", "page_view", { ...context });
			sent = true;
		}
	}

	if (win.__howismyipUmamiWebsiteId) {
		if (win.__howismyipUmamiLastPagePath !== routeKey) {
			win.__howismyipUmamiLastPagePath = routeKey;
			if (trackUmamiPageView(context, win)) sent = true;
		}
	}

	return sent;
}

/**
 * Starts an in-memory lookup timer and sends a low-cardinality event.
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

	const context = getAnalyticsPageContext(win.location.href, win, doc);
	const data = {
		lookup_mode: lookup.mode,
		ip_version: lookup.ipVersion,
	};
	let sent = false;

	if (win.gtag && win.__howismyipGaMeasurementId) {
		win.gtag("event", "ip_lookup_started", {
			...data,
			...context,
		});
		sent = true;
	}

	if (trackUmamiEvent("ip_lookup_started", data, context, win)) {
		sent = true;
	}

	return sent;
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

	const context = getAnalyticsPageContext(win.location.href, win, doc);
	const data = {
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
	};
	let sent = false;

	if (win.gtag && win.__howismyipGaMeasurementId) {
		win.gtag("event", "ip_lookup_completed", {
			...data,
			...context,
		});
		sent = true;
	}

	if (trackUmamiEvent("ip_lookup_completed", data, context, win)) {
		sent = true;
	}

	return sent;
}

/** Conversion-oriented event for links from howismyip to related products. */
export function trackRelatedProductClick(
	click: RelatedProductClick,
	win: Window = window,
	doc: Document = document,
): boolean {
	const context = getAnalyticsPageContext(win.location.href, win, doc);
	const data = {
		product: click.product,
		placement: click.placement,
		link_url: click.destination,
		language: click.language,
	};
	let sent = false;

	if (win.gtag && win.__howismyipGaMeasurementId) {
		win.gtag("event", "related_product_click", {
			...data,
			...context,
		});
		sent = true;
	}

	if (trackUmamiEvent("related_product_click", data, context, win)) {
		sent = true;
	}

	return sent;
}
