const GA_SCRIPT_ID = "howismyip-google-analytics";
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

type Gtag = (...args: unknown[]) => void;

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: Gtag;
		__howismyipGaMeasurementId?: string;
		__howismyipGaLastPagePath?: string;
	}
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
