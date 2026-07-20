// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
	initializeGoogleAnalytics,
	isGaMeasurementId,
	trackPageView,
	trackRelatedProductClick,
} from "./analytics";

function resetAnalytics() {
	window.dataLayer = undefined;
	window.gtag = undefined;
	window.__howismyipGaMeasurementId = undefined;
	window.__howismyipGaLastPagePath = undefined;
	document.getElementById("howismyip-google-analytics")?.remove();
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
		expect(window.dataLayer?.[1]).toEqual([
			"config",
			"G-ABC123XYZ",
			{ send_page_view: false },
		]);
	});

	it("tracks each SPA location once", () => {
		initializeGoogleAnalytics("G-ABC123XYZ");

		expect(trackPageView("/zh?source=test")).toBe(true);
		expect(trackPageView("/zh?source=test")).toBe(false);
		expect(trackPageView("/en/8.8.8.8")).toBe(true);

		expect(window.dataLayer?.slice(2)).toEqual([
			[
				"event",
				"page_view",
				{
					page_location: "http://localhost:3000/zh?source=test",
					page_path: "/zh?source=test",
					page_title: "howismyip test",
				},
			],
			[
				"event",
				"page_view",
				{
					page_location: "http://localhost:3000/en/8.8.8.8",
					page_path: "/en/8.8.8.8",
					page_title: "howismyip test",
				},
			],
		]);
	});

	it("tracks related-product clicks with funnel dimensions", () => {
		initializeGoogleAnalytics("G-ABC123XYZ");
		expect(
			trackRelatedProductClick({
				product: "search1api",
				placement: "footer_credit",
				destination: "https://www.search1api.com/",
				language: "zh",
			}),
		).toBe(true);
		expect(window.dataLayer?.at(-1)).toEqual([
			"event",
			"related_product_click",
			{
				product: "search1api",
				placement: "footer_credit",
				link_url: "https://www.search1api.com/",
				language: "zh",
			},
		]);
	});
});
