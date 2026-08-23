import type { IpReport, ProviderResult } from "@howismyip/core";

export type LookupCacheStatus = "HIT" | "MISS" | "BYPASS";
export type LookupEntrypoint =
	| "ip_server_fn"
	| "self_server_fn"
	| "api_ip"
	| "api_me"
	| "og_image"
	| "unknown";

type UpstreamStatus = ProviderResult["status"];

export interface LookupTelemetry {
	message: "ip lookup completed";
	event: "ip_lookup_completed";
	entrypoint: LookupEntrypoint;
	cache_status: Lowercase<LookupCacheStatus>;
	duration_ms: number;
	ip_version: "ipv4" | "ipv6";
	report_status: "complete" | "partial";
	report_provider_total_count: number;
	report_provider_ok_count: number;
	report_provider_error_count: number;
	report_provider_skipped_count: number;
	upstream_call_count: number;
	upstream_timeout_count: number;
	slowest_provider: string | null;
	slowest_provider_ms: number | null;
	timeout_providers: string[];
	provider_durations_ms: Record<string, number>;
	provider_statuses: Record<string, UpstreamStatus>;
}

function isTimeout(source: ProviderResult): boolean {
	return (
		source.status === "error" && /timeout|timed out/i.test(source.error ?? "")
	);
}

/**
 * Builds one privacy-safe, searchable event for Cloudflare Workers Logs.
 * Cache hits expose report coverage but never replay the cached upstream
 * timings as though those providers were called during this invocation.
 */
export function buildLookupTelemetry(
	report: IpReport,
	cache: LookupCacheStatus,
	durationMs: number,
	entrypoint: LookupEntrypoint,
): LookupTelemetry {
	const providerDurationsMs: Record<string, number> = {};
	const providerStatuses: Record<string, UpstreamStatus> = {};
	const timeoutProviders: string[] = [];
	let slowest: ProviderResult | null = null;
	let upstreamCallCount = 0;

	if (cache !== "HIT") {
		for (const source of report.sources) {
			if (source.status === "skipped") continue;
			upstreamCallCount += 1;
			providerDurationsMs[source.id] = Math.max(
				0,
				Math.round(source.durationMs),
			);
			providerStatuses[source.id] = source.status;
			if (isTimeout(source)) timeoutProviders.push(source.id);
			if (!slowest || source.durationMs > slowest.durationMs) {
				slowest = source;
			}
		}
	}

	const reportProviderErrorCount = report.sources.filter(
		(source) => source.status === "error",
	).length;
	const reportProviderSkippedCount = report.sources.filter(
		(source) => source.status === "skipped",
	).length;

	return {
		message: "ip lookup completed",
		event: "ip_lookup_completed",
		entrypoint,
		cache_status: cache.toLowerCase() as Lowercase<LookupCacheStatus>,
		duration_ms: Math.max(0, Math.round(durationMs)),
		ip_version: report.ip.includes(":") ? "ipv6" : "ipv4",
		report_status:
			reportProviderErrorCount > 0 || reportProviderSkippedCount > 0
				? "partial"
				: "complete",
		report_provider_total_count: report.sources.length,
		report_provider_ok_count: report.sources.filter(
			(source) => source.status === "ok",
		).length,
		report_provider_error_count: reportProviderErrorCount,
		report_provider_skipped_count: reportProviderSkippedCount,
		upstream_call_count: upstreamCallCount,
		upstream_timeout_count: timeoutProviders.length,
		slowest_provider: slowest?.id ?? null,
		slowest_provider_ms: slowest
			? Math.max(0, Math.round(slowest.durationMs))
			: null,
		timeout_providers: timeoutProviders,
		provider_durations_ms: providerDurationsMs,
		provider_statuses: providerStatuses,
	};
}

/** Cloudflare indexes object fields from console.log as structured JSON. */
export function logLookupTelemetry(telemetry: LookupTelemetry): void {
	console.log(telemetry);
}
