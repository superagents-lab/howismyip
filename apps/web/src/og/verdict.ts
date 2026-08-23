import type { IpReport, ProviderResult } from "@howismyip/core";

export type VerdictTone = "good" | "warn" | "bad";

export interface Verdict {
	/** Human-readable one-line verdict, e.g. "high · VPN". */
	text: string;
	/** Color tone for the verdict. */
	tone: VerdictTone;
	/** The risk score from the highest-severity source, or null. */
	score: number | null;
	/** Number of risk/blocklist sources consulted. */
	sources: number;
	/** Signal labels raised by at least 2 sources, most-agreed first. */
	signals: string[];
}

const LEVEL_ORDER: Record<string, number> = { high: 2, medium: 1, low: 0 };
const TONE_BY_LEVEL: Record<string, VerdictTone> = {
	high: "bad",
	medium: "warn",
	low: "good",
};

/** Signals checked in priority order — matches the site's risk matrix logic. */
const SIGNAL_KEYS = [
	["is_vpn", "vpn"],
	["is_tor", "tor"],
	["is_proxy", "proxy"],
	["is_hosting", "hosting"],
	["is_abuser", "abuser"],
	["is_crawler", "crawler"],
] as const;

function meaningfulProviderType(value: string | null): string | null {
	if (!value || /premium field|upgrade to view|^unknown$/i.test(value)) {
		return null;
	}
	return value;
}

/** One-line verdict for a single risk source (mirrors `verdict()` in risk-matrix). */
function sourceVerdict(source: ProviderResult): {
	level: string | null;
	label: string | null;
	score: number | null;
} {
	const d = source.data;
	if (!d) {
		return { level: null, label: null, score: null };
	}
	const signalKey = SIGNAL_KEYS.find(([key]) => d[key] === true);
	const signal = signalKey ? signalKey[1] : null;
	const providerType =
		meaningfulProviderType(d.proxy_type) ??
		meaningfulProviderType(d.usage_type) ??
		meaningfulProviderType(d.company_type) ??
		meaningfulProviderType(d.connection_type);
	return {
		level: d.risk_level,
		label: signal ?? providerType,
		score: d.risk_score,
	};
}

/**
 * Aggregates a concise overall verdict from all consulted risk/blocklist
 * sources: the highest severity level wins (high > medium > low). Level,
 * signal label, color, and score all come from the same highest-severity
 * source, so they never disagree (no "high" from one source paired with a
 * "VPN" label from another).
 */
export function buildVerdict(report: IpReport | null): Verdict {
	const empty: Verdict = {
		text: "lookup unavailable",
		tone: "muted" as VerdictTone,
		score: null,
		sources: 0,
		signals: [],
	};
	if (!report) {
		return empty;
	}

	const riskSources = report.sources.filter(
		(s) =>
			(s.category === "risk" || s.category === "blocklist") &&
			s.status === "ok" &&
			s.data,
	);
	if (riskSources.length === 0) {
		return { ...empty, text: "✓ clean", tone: "good" };
	}

	// Vote across sources for the boolean signals. A label only shows up when
	// at least 2 sources agree, so single-source noise stays out of the card.
	const signalVotes = new Map<string, number>();
	let best: { level: string; label: string | null; score: number | null } | null =
		null;
	for (const source of riskSources) {
		const v = sourceVerdict(source);
		if (v.label && SIGNAL_KEYS.some(([key]) => v.label === key[1])) {
			signalVotes.set(v.label, (signalVotes.get(v.label) ?? 0) + 1);
		}
		if (!v.level) continue;
		const current = best ? LEVEL_ORDER[best.level] : -1;
		const candidate = LEVEL_ORDER[v.level] ?? -1;
		// Prefer the highest severity; on a tie, a source with a label wins
		// (a bare "low" adds nothing over "low · hosting").
		if (candidate > current || (candidate === current && v.label && !best?.label)) {
			best = { level: v.level, label: v.label, score: v.score };
		}
	}
	const signals = [...signalVotes.entries()]
		.filter(([label, count]) => count >= 2 && label !== best?.label)
		.sort((a, b) => b[1] - a[1])
		.map(([label]) => label)
		.slice(0, 3);

	if (!best) {
		// No source gave a risk level. Fall back to the strongest agreed
		// signal, or a clean verdict.
		const anySignal = signals.length > 0 ? signals[0] : null;
		return {
			text: anySignal ?? "✓ clean",
			tone: "good",
			score: null,
			sources: riskSources.length,
			signals,
		};
	}

	const parts = [best.level, best.label].filter(Boolean);
	return {
		text: parts.join(" · "),
		tone: TONE_BY_LEVEL[best.level] ?? "good",
		score: best.score,
		sources: riskSources.length,
		signals,
	};
}
