import type { IpIntelligence, ProviderResult } from "@howismyip/core";
import { useState } from "react";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { countryDisplay, orDash, riskBarColor, riskColor } from "../lib/format";

type Tone = "good" | "warn" | "bad" | "muted";

const TONE_CLASS: Record<Tone, string> = {
	good: "text-phosphor",
	warn: "text-amber",
	bad: "text-danger",
	muted: "text-muted",
};

const FLAG_KEYS: Array<[keyof IpIntelligence, keyof Dictionary["signal"]]> = [
	["is_proxy", "proxy"],
	["is_vpn", "vpn"],
	["is_tor", "tor"],
	["is_hosting", "hosting"],
];

const DETAIL_FLAG_KEYS: Array<
	[keyof IpIntelligence, keyof Dictionary["signal"]]
> = [...FLAG_KEYS, ["is_mobile", "mobile"]];

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
				style={{ width: `${score}%` }}
			/>
		</div>
	);
}

function SignalChips({
	data,
	t,
	compact = false,
	className = "",
}: {
	data: IpIntelligence | null;
	t: Dictionary;
	compact?: boolean;
	className?: string;
}) {
	return (
		<div className={`flex flex-wrap gap-1.5 ${className}`}>
			{FLAG_KEYS.map(([key, labelKey]) => {
				const on = data?.[key] === true;
				return (
					<span
						key={key}
						className={`border px-1.5 py-0.5 text-[11px] ${
							on
								? "border-danger/70 text-danger"
								: "border-border text-muted/60"
						}`}
					>
						{compact && !on ? "·" : t.signal[labelKey]}
					</span>
				);
			})}
		</div>
	);
}

function ScoreMeter({
	score,
	level,
}: {
	score: number | null;
	level: IpIntelligence["risk_level"];
}) {
	return (
		<div className="mx-auto grid w-[12rem] max-w-full min-w-0 grid-cols-[3.25rem_1fr] items-center gap-2">
			<span
				className={`text-right font-bold text-sm ${score === null ? "text-muted" : riskColor(level)}`}
			>
				{score === null ? "·" : score}
			</span>
			<ScoreBar score={score} level={level} />
		</div>
	);
}

function fieldsFor(d: IpIntelligence, t: Dictionary): Array<[string, string]> {
	const f = t.fields;
	const rows: Array<[string, string | null]> = [
		[
			f.country,
			d.country_code || d.country_name
				? countryDisplay(d.country_name, d.country_code)
				: null,
		],
		[f.city, d.city],
		[f.region, d.region],
		[f.asn, d.asn],
		[f.isp, d.isp],
		[f.org, d.organization],
		[f.asDomain, d.as_domain],
		[f.proxyType, d.proxy_type],
		[f.rir, d.rir],
		[f.network, d.network_cidr],
		[f.allocated, d.allocation_date],
		[f.abuse, d.abuse_contact],
	];
	return rows.filter((r): r is [string, string] => Boolean(r[1]));
}

function DetailPanel({ source }: { source: ProviderResult }) {
	const t = useT();
	const d = source.data;
	const fields = d ? fieldsFor(d, t) : [];
	const sourceVerdict = verdict(source, t);

	return (
		<div className="border-border/60 border-t bg-bg/40 text-sm">
			{source.status === "error" && (
				<p className="px-3 py-3 text-danger text-xs">
					! {orDash(source.error)}
				</p>
			)}
			{source.status === "empty" && (
				<p className="px-3 py-3 text-muted text-xs">{t.card.noData}</p>
			)}

			{d && (
				<div className="grid md:grid-cols-[minmax(12rem,0.8fr)_minmax(14rem,1fr)_minmax(18rem,1.25fr)]">
					<div className="space-y-3 border-border/50 border-b p-3 md:border-r md:border-b-0">
						<div>
							<div className="mb-2 flex items-center justify-between gap-2">
								<span className="text-muted text-xs">{t.card.risk}</span>
								<span className={`font-bold ${riskColor(d.risk_level)}`}>
									{d.risk_score === null ? t.report.noScore : d.risk_score}
									{d.risk_level ? ` · ${t.risk[d.risk_level]}` : ""}
								</span>
							</div>
							<ScoreBar score={d.risk_score} level={d.risk_level} />
						</div>
						<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
							<span className="text-muted">{t.card.status}</span>
							<span className="text-fg">{source.status}</span>
							<span className="text-muted">{t.card.latency}</span>
							<span className="text-fg">{source.durationMs}ms</span>
						</div>
						<a
							href={source.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-block text-phosphor text-xs hover:underline"
						>
							{t.card.viewAtSource}
						</a>
					</div>

					<div className="space-y-3 border-border/50 border-b p-3 md:border-r md:border-b-0">
						<div>
							<div className="mb-2 text-muted text-xs">
								{t.report.colSignals}
							</div>
							<div className="flex flex-wrap gap-1.5">
								{DETAIL_FLAG_KEYS.map(([key, labelKey]) => {
									const on = d[key] === true;
									return (
										<span
											key={key}
											className={`border px-1.5 py-0.5 text-[11px] ${
												on
													? "border-danger/70 text-danger"
													: "border-border text-muted/60"
											}`}
										>
											{t.signal[labelKey]}
										</span>
									);
								})}
							</div>
						</div>
						<div>
							<div className="mb-1 text-muted text-xs">
								{t.report.colVerdict}
							</div>
							<p className={`text-xs ${TONE_CLASS[sourceVerdict.tone]}`}>
								{sourceVerdict.text}
							</p>
						</div>
						{d.blocklists.length > 0 && (
							<div className="text-danger text-xs">
								{t.card.listed} {d.blocklists.join(", ")}
							</div>
						)}
					</div>

					<div className="p-3">
						<div className="mb-2 text-muted text-xs">{t.card.evidence}</div>
						{fields.length > 0 ? (
							<dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
								{fields.map(([label, value]) => (
									<div
										key={label}
										className="min-w-0 border-border/40 border-b py-1"
									>
										<dt className="text-muted text-[11px]">{label}</dt>
										<dd className="break-words text-fg text-xs">{value}</dd>
									</div>
								))}
							</dl>
						) : (
							<p className="text-muted text-xs">{t.card.noData}</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

/** Expandable comparison of reputation sources.
 *  There is deliberately no composite score or provider weighting here. */
export function RiskMatrix({ sources }: { sources: ProviderResult[] }) {
	const t = useT();
	const [expandedId, setExpandedId] = useState<string | null>(null);

	return (
		<div className="border border-border bg-panel">
			<div className="hidden grid-cols-[1.25rem_9rem_minmax(11rem,0.9fr)_minmax(12rem,1fr)_minmax(12rem,1.2fr)] items-center border-border border-b bg-panel-2 text-center text-[11px] text-muted uppercase tracking-wider md:grid">
				<span className="px-2 py-2" />
				<span className="border-border/55 border-l px-3 py-2">
					{t.report.colSource}
				</span>
				<span className="border-border/55 border-l px-3 py-2">
					{t.report.colScore}
				</span>
				<span className="border-border/55 border-l px-3 py-2">
					{t.report.colSignals}
				</span>
				<span className="border-border/55 border-l px-3 py-2">
					{t.report.colVerdict}
				</span>
			</div>
			{sources.map((source) => {
				const d = source.data;
				const v = verdict(source, t);
				const score = d?.risk_score ?? null;
				const expanded = expandedId === source.id;
				const toggle = () => setExpandedId(expanded ? null : source.id);
				return (
					<div
						key={source.id}
						className="border-border/60 border-b last:border-b-0"
					>
						<button
							type="button"
							data-testid={`risk-toggle-${source.id}`}
							aria-expanded={expanded}
							onClick={toggle}
							className={`grid w-full cursor-pointer grid-cols-[1.25rem_1fr] gap-x-2 gap-y-2 border-l-2 py-3 text-left outline-none hover:bg-panel-2/60 focus-visible:bg-panel-2 focus-visible:ring-1 focus-visible:ring-phosphor-dim md:grid-cols-[1.25rem_9rem_minmax(11rem,0.9fr)_minmax(12rem,1fr)_minmax(12rem,1.2fr)] md:items-center md:gap-0 md:py-0 ${
								expanded
									? "border-l-phosphor-dim bg-panel-2"
									: "border-l-transparent"
							}`}
						>
							<span
								className="flex h-full items-start justify-center px-2 pt-0.5 text-phosphor text-xs md:items-center md:py-3 md:pt-3"
								aria-hidden="true"
							>
								{expanded ? "▾" : "▸"}
							</span>
							<div className="min-w-0 pr-3 md:w-full md:border-border/55 md:border-l md:px-3 md:py-3">
								<span className="truncate font-bold text-fg text-xs">
									{source.name}
								</span>
							</div>
							<div className="col-start-2 min-w-0 pr-3 md:col-start-auto md:flex md:w-full md:justify-center md:border-border/55 md:border-l md:px-3 md:py-3">
								<ScoreMeter score={score} level={d?.risk_level ?? null} />
							</div>
							<div className="col-start-2 pr-3 md:col-start-auto md:flex md:w-full md:justify-center md:border-border/55 md:border-l md:px-3 md:py-3">
								<SignalChips data={d} t={t} className="md:justify-center" />
							</div>
							<span
								className={`col-start-2 truncate pr-3 text-xs md:col-start-auto md:w-full md:border-border/55 md:border-l md:px-3 md:py-3 ${TONE_CLASS[v.tone]}`}
								title={v.text}
							>
								{v.text}
							</span>
						</button>
						{expanded && <DetailPanel source={source} />}
					</div>
				);
			})}
		</div>
	);
}
