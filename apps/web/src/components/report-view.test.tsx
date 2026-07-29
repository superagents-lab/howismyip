// @vitest-environment jsdom

import { emptyIntelligence, type IpReport } from "@howismyip/core";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportView } from "./report-view";

vi.mock("../i18n/use-t", async () => {
	const { getDictionary } = await import("../i18n/messages");
	return {
		useT: () => getDictionary("en"),
		useLocale: () => "en",
	};
});

afterEach(cleanup);

describe("ReportView", () => {
	it("integrates registration and routing into basic facts", () => {
		const networkData = {
			...emptyIntelligence("8.8.8.8"),
			announced_prefix: "8.8.8.0/24",
			is_announced: true,
			origin_asns: ["AS15169"],
			origin_holders: ["GOOGLE - Google LLC"],
			ptr: "dns.google",
			rpki_status: "valid" as const,
		};
		const report: IpReport = {
			ip: "8.8.8.8",
			queried_at: "2026-07-28T00:00:00.000Z",
			consensus: {
				country_code: "US",
				country_name: "United States",
				city: null,
				asn: "AS15169",
				isp: null,
				organization: null,
				rir: "ARIN",
				registered_country_code: "US",
				blocklists: [],
				source_count: 3,
			},
			facts: [
				{
					key: "country",
					values: [{ value: "United States (US)", sources: ["ipapi"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "asn",
					values: [{ value: "AS15169", sources: ["ipapi", "ripestat"] }],
					source_count: 2,
					conflict: false,
				},
				{
					key: "registration_country",
					values: [{ value: "US", sources: ["rdap"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "rir",
					values: [{ value: "ARIN", sources: ["rdap"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "allocation",
					values: [{ value: "8.0.0.0/9", sources: ["rdap"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "announced_prefix",
					values: [
						{
							value: "8.8.8.0/24",
							sources: ["ripestat", "Team Cymru"],
						},
					],
					source_count: 2,
					conflict: false,
				},
				{
					key: "origin_asn",
					values: [{ value: "AS15169", sources: ["ripestat"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "origin_holder",
					values: [{ value: "GOOGLE - Google LLC", sources: ["ripestat"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "announcement",
					values: [{ value: "announced", sources: ["ripestat"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "rpki",
					values: [{ value: "valid", sources: ["ripestat"] }],
					source_count: 1,
					conflict: false,
				},
				{
					key: "ptr",
					values: [{ value: "dns.google", sources: ["ripestat"] }],
					source_count: 1,
					conflict: false,
				},
			],
			sources: [
				{
					id: "ripestat",
					name: "RIPEstat",
					category: "network",
					requiresKey: false,
					sourceUrl: "https://stat.ripe.net/8.8.8.8",
					status: "ok",
					durationMs: 42,
					data: networkData,
					error: null,
				},
			],
		};

		render(<ReportView report={report} />);

		expect(screen.queryByText("// registration & routing")).toBeNull();

		const countryRow = screen.getByTestId("fact-sources-country");
		expect(within(countryRow).queryByText("registration")).toBeNull();

		const asnRow = screen.getByTestId("fact-sources-asn");
		expect(within(asnRow).queryByText("route")).toBeNull();

		const registrationEvidence = screen.getByTestId(
			"network-evidence-registration",
		);
		expect(within(registrationEvidence).getByText("registration")).toBeTruthy();
		expect(
			within(registrationEvidence).getByText("US · ARIN · 8.0.0.0/9"),
		).toBeTruthy();
		expect(
			within(registrationEvidence).getByText("matches geolocation"),
		).toBeTruthy();

		const routeEvidence = screen.getByTestId("network-evidence-route");
		expect(within(routeEvidence).getByText("route")).toBeTruthy();
		expect(
			within(routeEvidence).getByText("AS15169 → 8.8.8.0/24"),
		).toBeTruthy();
		expect(within(routeEvidence).getByText("matches basic ASN")).toBeTruthy();
		expect(within(routeEvidence).getByText("RPKI valid")).toBeTruthy();

		const ptrRow = screen.getByTestId("fact-sources-ptr");
		expect(within(ptrRow).getByText("reverse DNS")).toBeTruthy();
		expect(within(ptrRow).getByText("dns.google")).toBeTruthy();
		expect(screen.queryByText("origin ASN")).toBeNull();

		fireEvent.click(routeEvidence);
		expect(screen.getByText("origin ASN")).toBeTruthy();
		expect(screen.getByText("GOOGLE - Google LLC")).toBeTruthy();
		expect(screen.getByText(/ripestat, Team Cymru/)).toBeTruthy();
	});
});
