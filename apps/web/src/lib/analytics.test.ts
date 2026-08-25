// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureLookupStarted,
	getAnalyticsPageContext,
	inferIpVersion,
	initializeGoogleAnalytics,
	initializeUmami,
	isGaMeasurementId,
	isUmamiWebsiteId,
	trackLookupCompleted,
	trackLookupStarted,
	trackPageView,
	trackRelatedProductClick,
} from "./analytics";

function resetAnalytics() {
	window.dataLayer = undefined;
	window.gtag = undefined;
	window.umami = undefined;
	window.__howismyipGaMeasurementId = undefined;
	window.__howismyipGaLastPagePath = undefined;
	window.__howismyipUmamiWebsiteId = undefined;
	window.__howismyipUmamiLastPagePath = undefined;
	window.__howismyipUmamiQueue = undefined;
	window.__howismyipPendingLookup = undefined;
	document.getElementById("howismyip-google-analytics")?.remove();
	document.getElementById("howismyip-umami")?.remove();
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

describe("Umami", () => {
	beforeEach(() => {
		resetAnalytics();
		document.title = "howismyip test";
		window.history.replaceState({}, "", "/en");
	});

	it("accepts UUID website IDs only", () => {
		expect(isUmamiWebsiteId("e1996d0f-604d-4a79-a0ff-00b5afd627ec")).toBe(
			true,
		);
		expect(isUmamiWebsiteId(undefined)).toBe(false);
		expect(isUmamiWebsiteId("not-a-uuid")).toBe(false);
	});

	it("loads the tracker once with automatic pageviews disabled", () => {
		expect(initializeUmami()).toBe(true);
		expect(initializeUmami()).toBe(true);

		const script = document.getElementById(
			"howismyip-umami",
		) as HTMLScriptElement | null;
		expect(script?.src).toBe("https://umami.fatwang2.com/script.js");
		expect(script?.defer).toBe(true);
		expect(script?.dataset.websiteId).toBe(
			"e1996d0f-604d-4a79-a0ff-00b5afd627ec",
		);
		expect(script?.dataset.autoPageview).toBe("false");
		expect(document.querySelectorAll("#howismyip-umami")).toHaveLength(1);
	});

	it("queues pageviews until the script loads, then sends sanitized URLs", () => {
		const track = vi.fn((payload: unknown) => {
			if (typeof payload === "function") {
				return payload({ website: "test", url: "/raw", title: "raw" });
			}
			return payload;
		});

		initializeUmami();
		expect(trackPageView("/en/8.8.8.8")).toBe(true);
		expect(trackPageView("/en/8.8.8.8")).toBe(false);
		expect(window.__howismyipUmamiQueue).toHaveLength(1);

		window.umami = { track: track as never };
		document.getElementById("howismyip-umami")?.dispatchEvent(new Event("load"));

		expect(window.__howismyipUmamiQueue).toEqual([]);
		expect(track).toHaveBeenCalledTimes(1);
		expect(track.mock.calls[0]?.[0]({ website: "test", url: "/raw" })).toEqual(
			{
				website: "test",
				url: "/en/:ip",
				title: "IP report · howismyip",
			},
		);
		expect(JSON.stringify(track.mock.calls)).not.toContain("8.8.8.8");
	});

	it("tracks custom events with sanitized urls even without GA", () => {
		const payloads: unknown[] = [];
		window.umami = {
			track: ((payload: unknown) => {
				if (typeof payload === "function") {
					payloads.push(
						payload({
							website: "test",
							url: "/en/8.8.8.8",
							title: "8.8.8.8 · howismyip",
						}),
					);
				}
			}) as never,
		};
		window.history.replaceState({}, "", "/en/8.8.8.8");
		initializeUmami();

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
					cacheStatus: "HIT",
					serverDurationMs: 12,
				},
				window,
				document,
				180,
			),
		).toBe(true);
		expect(
			trackRelatedProductClick({
				product: "search1api",
				placement: "footer_credit",
				destination: "https://www.search1api.com/",
				language: "en",
			}),
		).toBe(true);

		expect(payloads).toEqual([
			{
				website: "test",
				url: "/en/:ip",
				title: "IP report · howismyip",
				name: "ip_lookup_started",
				data: {
					lookup_mode: "manual",
					ip_version: "ipv4",
				},
			},
			{
				website: "test",
				url: "/en/:ip",
				title: "IP report · howismyip",
				name: "ip_lookup_completed",
				data: {
					lookup_mode: "manual",
					ip_version: "ipv4",
					outcome: "success",
					duration_ms: 80,
					cache_status: "hit",
					provider_total: 0,
					provider_ok: 0,
					provider_error: 0,
					provider_skipped: 0,
					provider_timeout: 0,
					server_duration_ms: 12,
				},
			},
			{
				website: "test",
				url: "/en/:ip",
				title: "IP report · howismyip",
				name: "related_product_click",
				data: {
					product: "search1api",
					placement: "footer_credit",
					link_url: "https://www.search1api.com/",
					language: "en",
				},
			},
		]);
		expect(JSON.stringify(payloads)).not.toContain("8.8.8.8");
	});

	it("dual-sends pageviews to GA and Umami independently", () => {
		const track = vi.fn();
		window.umami = { track: track as never };
		initializeGoogleAnalytics("G-ABC123XYZ");
		initializeUmami();

		expect(trackPageView("/zh")).toBe(true);
		expect(track).toHaveBeenCalledTimes(1);
		expect(gtagCommandAt(2)?.[0]).toBe("event");
		expect(gtagCommandAt(2)?.[1]).toBe("page_view");

		expect(trackPageView("/zh")).toBe(false);
		expect(track).toHaveBeenCalledTimes(1);
	});
});
