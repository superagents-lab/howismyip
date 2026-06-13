import type { IpIntelligence, ProviderResult } from "@howismyip/core";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { riskBarColor, riskColor } from "../lib/format";

type Tone = "good" | "warn" | "bad" | "muted";

const TONE_CLASS: Record<Tone, string> = {
	good: "text-phosphor",
	warn: "text-amber",
	bad: "text-danger",
	muted: "text-muted",
};

/** One-line verdict per source, with a tone for coloring. */
function verdict(
	s: ProviderResult,
	t: Dictionary,
): { text: string; tone: Tone } {
	if (s.status === "error") {
		return { text: `! ${s.error ?? "error"}`, tone: "bad" };
	}
	if (s.status === "empty" || !s.data) {
		return { text: t.card.noData, tone: "muted" };
	}
	const d = s.data;
	if (s.id === "tor") {
		return d.is_tor
			? { text: t.card.torExit, tone: "bad" }
			: { text: `✓ ${t.card.notTor}`, tone: "good" };
	}
	if (s.id === "dnsbl") {
		return d.blocklists.length > 0
			? { text: `${t.card.listed} ${d.blocklists.join(", ")}`, tone: "bad" }
			: { text: `✓ ${t.card.notListed}`, tone: "good" };
	}
	const level = d.risk_level ? t.risk[d.risk_level] : null;
	const parts = [level, d.proxy_type].filter(Boolean) as string[];
	if (parts.length === 0) {
		return { text: `✓ ${t.card.clean}`, tone: "good" };
	}
	const tone: Tone =
		d.risk_level === "high"
			? "bad"
			: d.risk_level === "medium"
				? "warn"
				: "muted";
	return { text: parts.join(" · "), tone };
}

const FLAG_KEYS: Array<[keyof IpIntelligence, string]> = [
	["is_proxy", "P"],
	["is_vpn", "V"],
	["is_tor", "T"],
	["is_hosting", "H"],
];

function Flags({ d }: { d: IpIntelligence | null }) {
	return (
		<div className="flex gap-1.5">
			{FLAG_KEYS.map(([key, label]) => {
				const on = d?.[key] === true;
				return (
					<span
						key={label}
						title={label}
						className={on ? "text-danger" : "text-muted/50"}
					>
						{on ? "●" : "·"}
					</span>
				);
			})}
		</div>
	);
}

function ScoreBar({
	score,
	level,
}: {
	score: number | null;
	level: IpIntelligence["risk_level"];
}) {
	if (score === null) {
		return <div className="h-1.5 w-full bg-border/40" />;
	}
	return (
		<div className="h-1.5 w-full bg-border/40">
			<div
				className={`h-full ${riskBarColor(level)}`}
				style={{ width: `${Math.max(2, score)}%` }}
			/>
		</div>
	);
}

/** Compact comparison of every scoring / reputation source — the core view.
 *  Each row: source · score+bar · proxy/vpn/tor/host flags · one-line verdict. */
export function RiskMatrix({ sources }: { sources: ProviderResult[] }) {
	const t = useT();
	return (
		<div className="overflow-x-auto border border-border bg-panel">
			<div className="min-w-[34rem]">
				{/* header */}
				<div className="grid grid-cols-[7rem_2.5rem_1fr_4.5rem_minmax(7rem,1.2fr)] items-center gap-3 border-border border-b bg-panel-2 px-3 py-2 text-[11px] text-muted uppercase tracking-wider">
					<span>{t.report.colSource}</span>
					<span className="text-right">{t.report.colScore}</span>
					<span />
					<span className="font-mono tracking-[0.3em]">PVTH</span>
					<span>{t.report.colVerdict}</span>
				</div>
				{sources.map((s) => {
					const d = s.data;
					const v = verdict(s, t);
					const score = d?.risk_score ?? null;
					return (
						<div
							key={s.id}
							className="grid grid-cols-[7rem_2.5rem_1fr_4.5rem_minmax(7rem,1.2fr)] items-center gap-3 border-border/50 border-b px-3 py-2 last:border-b-0"
						>
							<a
								href={s.sourceUrl}
								target="_blank"
								rel="noreferrer"
								className="truncate font-bold text-fg text-xs hover:text-phosphor"
								title={s.name}
							>
								{s.name}
							</a>
							<span
								className={`text-right font-bold text-sm ${score === null ? "text-muted" : riskColor(d?.risk_level ?? null)}`}
							>
								{score === null ? "·" : score}
							</span>
							<ScoreBar score={score} level={d?.risk_level ?? null} />
							<Flags d={d} />
							<span
								className={`truncate text-xs ${TONE_CLASS[v.tone]}`}
								title={v.text}
							>
								{v.text}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
