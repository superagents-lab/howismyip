import { describe, expect, it } from "vitest";
import { staticIspUrl } from "./product-credit";

describe("staticIspUrl", () => {
	it("builds a tracked Chinese product URL", () => {
		const url = new URL(staticIspUrl("zh"));
		expect(url.host).toBe("s1.dev");
		expect(url.pathname).toBe("/zh/proxies/static-isp");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			utm_source: "howismyip",
			utm_medium: "referral",
			utm_campaign: "static_isp",
			utm_content: "footer_credit",
		});
	});

	it("uses the unprefixed English product URL", () => {
		expect(new URL(staticIspUrl("en")).pathname).toBe("/proxies/static-isp");
	});
});
