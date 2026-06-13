import type { ProviderCategory, RiskLevel } from "@howismyip/core";

/** Tailwind text-color class for a risk level. */
export function riskColor(level: RiskLevel | null): string {
	switch (level) {
		case "high":
			return "text-danger";
		case "medium":
			return "text-amber";
		case "low":
			return "text-phosphor";
		default:
			return "text-muted";
	}
}

/** Tailwind background-color class for a risk level (literal so Tailwind emits it). */
export function riskBarColor(level: RiskLevel | null): string {
	switch (level) {
		case "high":
			return "bg-danger";
		case "medium":
			return "bg-amber";
		case "low":
			return "bg-phosphor";
		default:
			return "bg-muted";
	}
}

/** Accent color class per provider category. */
export function categoryColor(category: ProviderCategory): string {
	switch (category) {
		case "risk":
			return "text-danger";
		case "network":
			return "text-cyan";
		case "registry":
			return "text-amber";
		case "blocklist":
			return "text-danger";
		default:
			return "text-phosphor";
	}
}

/** "United States (US)" / "United States" / "US" / "—". */
export function countryDisplay(
	name: string | null,
	code: string | null,
): string {
	if (name && code) {
		return `${name} (${code})`;
	}
	return name ?? code ?? "—";
}

export function orDash(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === "") {
		return "—";
	}
	return String(value);
}

export function formatTimestamp(iso: string): string {
	return new Date(iso).toLocaleString();
}
