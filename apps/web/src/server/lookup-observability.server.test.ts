import type { IpReport, ProviderResult } from "@howismyip/core";
import { describe, expect, it, vi } from "vitest";
import {
	buildLookupTelemetry,
	logLookupTelemetry,
} from "./lookup-observability.server";

function source(
	id: string,
	status: ProviderResult["status"],
	durationMs: number,
	error: string | null = null,
): ProviderResult {
	return {
		id,
		name: id,
		category: "network",
		requiresKey: false,
		sourceUrl: `https://example.com/${id}`,
		status,
		durationMs,
		data: null,
		error,
	};
}

function report(ip = "2001:4860:4860::8888"): IpReport {
	return {
		ip,
		queried_at: "2026-07-29T00:00:00.000Z",
		consensus: {
			country_code: null,
			country_name: null,
			city: null,
			asn: null,
			isp: null,
			organization: null,
			rir: null,
			registered_country_code: null,
			blocklists: [],
			source_count: 0,
		},
		facts: [],
		sources: [
			source("geojs", "ok", 84),
			source("rdap", "error", 10_000, "Timeout after 10000ms"),
			source("ipinfo", "skipped", 0, "quota exhausted"),
		],
	};
}

describe("lookup observability", () => {
	it("summarizes an uncached lookup without logging the IP or raw errors", () => {
		const telemetry = buildLookupTelemetry(
			report(),
			"MISS",
			10_245.6,
			"ip_server_fn",
		);

		expect(telemetry).toMatchObject({
			event: "ip_lookup_completed",
			entrypoint: "ip_server_fn",
			cache_status: "miss",
			duration_ms: 10_246,
			ip_version: "ipv6",
			report_status: "partial",
			report_provider_total_count: 3,
			report_provider_ok_count: 1,
			report_provider_error_count: 1,
			report_provider_skipped_count: 1,
			upstream_call_count: 2,
			upstream_timeout_count: 1,
			slowest_provider: "rdap",
			slowest_provider_ms: 10_000,
			timeout_providers: ["rdap"],
			provider_durations_ms: { geojs: 84, rdap: 10_000 },
			provider_statuses: { geojs: "ok", rdap: "error" },
		});
		const serialized = JSON.stringify(telemetry);
		expect(serialized).not.toContain("2001:4860:4860::8888");
		expect(serialized).not.toContain("Timeout after 10000ms");
		expect(serialized).not.toContain("example.com");
	});

	it("does not report cached provider timings as fresh upstream calls", () => {
		const telemetry = buildLookupTelemetry(
			report("8.8.8.8"),
			"HIT",
			218,
			"api_ip",
		);

		expect(telemetry).toMatchObject({
			cache_status: "hit",
			ip_version: "ipv4",
			upstream_call_count: 0,
			upstream_timeout_count: 0,
			slowest_provider: null,
			slowest_provider_ms: null,
			timeout_providers: [],
			provider_durations_ms: {},
			provider_statuses: {},
		});
	});

	it("emits one structured object for Workers Logs", () => {
		const telemetry = buildLookupTelemetry(report(), "BYPASS", 500, "unknown");
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		logLookupTelemetry(telemetry);

		expect(log).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledWith(telemetry);
		log.mockRestore();
	});
});
