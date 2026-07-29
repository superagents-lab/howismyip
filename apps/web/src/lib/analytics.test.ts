// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
	ensureLookupStarted,
	getAnalyticsPageContext,
	inferIpVersion,
	initializeGoogleAnalytics,
	isGaMeasurementId,
	trackLookupCompleted,
	trackLookupStarted,
	trackPageView,
	trackRelatedProductClick,
} from "./analytics";

function resetAnalytics() {
	window.dataLayer = undefined;
	window.gtag = undefined;
	window.__howismyipGaMeasurementId = undefined;
	window.__howismyipGaLastPagePath = undefined;
	window.__howismyipPendingLookup = undefined;
	document.getElementById("howismyip-google-analytics")?.remove();
}

function gtagCommandAt(index: number): unknown[] | undefined {
	const entry = window.dataLayer?.[index];
	return entry == null ? undefined : Array.from(entry as ArrayLike<unknown>);
}

describe("Google Analytics", () => {
	beforeEach(() => {
		resetAnalytics();
		document.title = "howismyip test";
		window.history.replaceState({}, "", "/en");
	});

	it("accepts GA4 measurement IDs only", () => {
		expect(isGaMeasurementId("G-ABC123XYZ")).toBe(true);
		expect(isGaMeasurementId(undefined)).toBe(false);
		expect(isGaMeasurementId("UA-123-4")).toBe(false);
	});

	it("loads and configures gtag once", () => {
		expect(initializeGoogleAnalytics("G-ABC123XYZ")).toBe(true);
		expect(initializeGoogleAnalytics("G-ABC123XYZ")).toBe(true);

		const script = document.getElementById(
			"howismyip-google-analytics",
		) as HTMLScriptElement | null;
		expect(script?.src).toBe(
			"https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ",
		);
		expect(
			document.querySelectorAll("#howismyip-google-analytics"),
		).toHaveLength(1);
		expect(Array.isArray(window.dataLayer?.[0])).toBe(false);
		expect(gtagCommandAt(1)).toEqual([
			"config",
			"G-ABC123XYZ",
			{
				send_page_view: false,
				page_location: "http://localhost:3000/en",
				page_path: "/en",
				page_title: "howismyip test",
			},
		]);
	});

	it("redacts IP report locations, titles, query strings, and hashes", () => {
		document.title = "8.8.8.8 · howismyip";
		expect(
			getAnalyticsPageContext("/zh/8.8.8.8?address=1.1.1.1#8.8.4.4"),
		).toEqual({
			page_location: "http://localhost:3000/zh/:ip",
			page_path: "/zh/:ip",
			page_title: "IP report · howismyip",
		});
	});

	it("tracks each actual SPA location once with sanitized context", () => {
		initializeGoogleAnalytics("G-ABC123XYZ");

		expect(trackPageView("/zh?source=test")).toBe(true);
		expect(trackPageView("/zh?source=test")).toBe(false);
		expect(trackPageView("/en/8.8.8.8")).toBe(true);
		expect(trackPageView("/en/1.1.1.1")).toBe(true);

		expect(
			window.dataLayer?.slice(2).map((_, index) => gtagCommandAt(index + 2)),
		).toEqual([
			[
				"event",
				"page_view",
				{
					page_location: "http://localhost:3000/zh",
					page_path: "/zh",
					page_title: "howismyip test",
				},
			],
			[
				"event",
				"page_view",
				{
					page_location: "http://localhost:3000/en/:ip",
					page_path: "/en/:ip",
					page_title: "IP report · howismyip",
				},
			],
			[
				"event",
				"page_view",
				{
					page_location: "http://localhost:3000/en/:ip",
					page_path: "/en/:ip",
					page_title: "IP report · howismyip",
				},
			],
		]);
	});

	it("infers only the IP version needed for analytics", () => {
		expect(inferIpVersion("8.8.8.8")).toBe("ipv4");
		expect(inferIpVersion("2001:4860:4860::8888")).toBe("ipv6");
		expect(inferIpVersion("not-an-ip")).toBe("unknown");
	});

	it("tracks lookup duration and provider summaries without the queried IP", () => {
		window.history.replaceState({}, "", "/en/8.8.8.8");
		initializeGoogleAnalytics("G-ABC123XYZ");

		expect(
			trackLookupStarted(
				{ mode: "manual", ipVersion: "ipv4" },
				window,
				document,
				100,
			),
		).toBe(true);
		expect(
			trackLookupCompleted(
				{
					outcome: "success",
					ipVersion: "ipv4",
					cacheStatus: "MISS",
					serverDurationMs: 1_020.4,
					providers: [
						{
							id: "geojs",
							status: "ok",
							durationMs: 82,
							error: null,
						},
						{
							id: "rdap",
							status: "error",
							durationMs: 1_000,
							error: "Timeout after 1000ms",
						},
						{
							id: "ipinfo",
							status: "skipped",
							durationMs: 0,
							error: "quota exhausted",
						},
					],
				},
				window,
				document,
				1_250.2,
			),
		).toBe(true);

		expect(gtagCommandAt(2)).toEqual([
			"event",
			"ip_lookup_started",
			{
				lookup_mode: "manual",
				ip_version: "ipv4",
				page_location: "http://localhost:3000/en/:ip",
				page_path: "/en/:ip",
				page_title: "IP report · howismyip",
			},
		]);
		expect(gtagCommandAt(3)).toEqual([
			"event",
			"ip_lookup_completed",
			{
				lookup_mode: "manual",
				ip_version: "ipv4",
				outcome: "success",
				duration_ms: 1150,
				cache_status: "miss",
				provider_total: 3,
				provider_ok: 1,
				provider_error: 1,
				provider_skipped: 1,
				provider_timeout: 1,
				server_duration_ms: 1020,
				slowest_provider: "rdap",
				slowest_provider_ms: 1000,
				page_location: "http://localhost:3000/en/:ip",
				page_path: "/en/:ip",
				page_title: "IP report · howismyip",
			},
		]);
		expect(JSON.stringify([gtagCommandAt(2), gtagCommandAt(3)])).not.toContain(
			"8.8.8.8",
		);
		expect(window.__howismyipPendingLookup).toBeUndefined();
	});

	it("keeps a click timer when the report route ensures direct tracking", () => {
		initializeGoogleAnalytics("G-ABC123XYZ");
		trackLookupStarted(
			{ mode: "manual", ipVersion: "ipv4" },
			window,
			document,
			100,
		);

		expect(
			ensureLookupStarted(
				{ mode: "direct", ipVersion: "ipv4" },
				window,
				document,
				200,
			),
		).toBe(false);
		expect(
			trackLookupCompleted(
				{ outcome: "failed", ipVersion: "ipv4" },
				window,
				document,
				350,
			),
		).toBe(true);
		expect(gtagCommandAt(3)?.[2]).toMatchObject({
			lookup_mode: "manual",
			duration_ms: 250,
			outcome: "failed",
		});
		expect(
			trackLookupCompleted(
				{ outcome: "failed", ipVersion: "ipv4" },
				window,
				document,
				500,
			),
		).toBe(false);
	});

	it("tracks related-product clicks with a sanitized page context", () => {
		window.history.replaceState({}, "", "/zh/8.8.8.8?source=test");
		document.title = "8.8.8.8 · howismyip";
		initializeGoogleAnalytics("G-ABC123XYZ");
		expect(
			trackRelatedProductClick({
				product: "search1api",
				placement: "footer_credit",
				destination: "https://www.search1api.com/",
				language: "zh",
			}),
		).toBe(true);
		expect(gtagCommandAt((window.dataLayer?.length ?? 0) - 1)).toEqual([
			"event",
			"related_product_click",
			{
				product: "search1api",
				placement: "footer_credit",
				link_url: "https://www.search1api.com/",
				language: "zh",
				page_location: "http://localhost:3000/zh/:ip",
				page_path: "/zh/:ip",
				page_title: "IP report · howismyip",
			},
		]);
	});
});
