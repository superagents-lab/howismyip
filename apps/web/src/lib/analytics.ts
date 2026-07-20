const GA_SCRIPT_ID = "howismyip-google-analytics";
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

type Gtag = (...args: unknown[]) => void;

declare global {
	interface Window {
		dataLayer?: unknown[][];
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

export function isGaMeasurementId(value: string | undefined): value is string {
	return GA_MEASUREMENT_ID_PATTERN.test(value ?? "");
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
		function gtag(...args: unknown[]) {
			win.dataLayer?.push(args);
		};

	win.__howismyipGaMeasurementId = measurementId;
	win.gtag("js", new Date());
	win.gtag("config", measurementId, { send_page_view: false });

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
	const pagePath = `${location.pathname}${location.search}${location.hash}`;
	if (win.__howismyipGaLastPagePath === pagePath) return false;

	win.__howismyipGaLastPagePath = pagePath;
	win.gtag("event", "page_view", {
		page_location: location.href,
		page_path: pagePath,
		page_title: doc.title,
	});
	return true;
}

/** Conversion-oriented event for links from howismyip to related products. */
export function trackRelatedProductClick(
	click: RelatedProductClick,
	win: Window = window,
): boolean {
	if (!win.gtag || !win.__howismyipGaMeasurementId) return false;

	win.gtag("event", "related_product_click", {
		product: click.product,
		placement: click.placement,
		link_url: click.destination,
		language: click.language,
	});
	return true;
}
