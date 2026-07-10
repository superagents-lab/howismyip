import type { IpIntelligence, ProviderResult } from "@howismyip/core";
import { useState } from "react";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import {
	countryDisplay,
	formatRiskScore,
	orDash,
	riskBarColor,
	riskColor,
} from "../lib/format";

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
	["is_abuser", "abuser"],
	["is_crawler", "crawler"],
];

const DETAIL_FLAG_KEYS: Array<
	[keyof IpIntelligence, keyof Dictionary["signal"]]
> = [
	...FLAG_KEYS,
	["is_mobile", "mobile"],
	["is_anycast", "anycast"],
	["is_relay", "relay"],
];

const VERDICT_SIGNAL_KEYS: Array<
	[keyof IpIntelligence, keyof Dictionary["signal"]]
> = [
	["is_vpn", "vpn"],
	["is_tor", "tor"],
	["is_proxy", "proxy"],
	["is_hosting", "hosting"],
	["is_abuser", "abuser"],
	["is_crawler", "crawler"],
];

function meaningfulProviderType(value: string | null): string | null {
	if (!value || /premium field|upgrade to view|^unknown$/i.test(value)) {
		return null;
	}
	return value;
}

/** One-line verdict per source, with a tone for coloring. */
function verdict(
	s: ProviderResult,
	t: Dictionary,
): { text: string; tone: Tone } {
	if (s.status === "error") {
		return { text: `! ${s.error ?? "error"}`, tone: "bad" };
	}
	if (s.status === "skipped") {
		return { text: t.card.quotaExhausted, tone: "muted" };
	}
	if (s.status === "empty" || !s.data) {
		return { text: t.card.noData, tone: "muted" };
	}
	const d = s.data;
	const level = d.risk_level ? t.risk[d.risk_level] : null;
	const activeSignal = VERDICT_SIGNAL_KEYS.find(([key]) => d[key] === true);
	const signal = activeSignal ? t.signal[activeSignal[1]] : null;
	const providerType =
		meaningfulProviderType(d.proxy_type) ??
		meaningfulProviderType(d.usage_type) ??
		meaningfulProviderType(d.company_type) ??
		meaningfulProviderType(d.connection_type);
	const parts = [level, signal ?? providerType].filter(Boolean) as string[];
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
	const width = Math.max(0, Math.min(100, score));
	return (
		<div className="h-1.5 w-full bg-border/40">
			<div
				className={`h-full ${riskBarColor(level)}`}
				style={{ width: `${width}%` }}
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
	const signals = FLAG_KEYS.map(([key, labelKey]) => ({
		key,
		labelKey,
		on: data?.[key] === true,
	})).filter((signal) => !compact || signal.on);

	if (signals.length === 0) {
		return <span className="text-muted text-xs">{t.card.noActiveSignals}</span>;
	}

	return (
		<div className={`flex flex-wrap gap-1.5 ${className}`}>
			{signals.map(({ key, labelKey, on }) => {
				return (
					<span
						key={key}
						className={`border px-1.5 py-0.5 text-[11px] ${
							on ? "border-danger/70 text-danger" : "border-border text-muted"
						}`}
					>
						{t.signal[labelKey]}
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
				{score === null ? "·" : formatRiskScore(score)}
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
		[f.usageType, d.usage_type],
		[f.companyType, d.company_type],
		[f.connectionType, d.connection_type],
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
		<div className="risk-detail border-border/60 border-t bg-bg/40 text-sm">
			{source.status === "error" && (
				<p className="px-3 py-3 text-danger text-xs">
					! {orDash(source.error)}
				</p>
			)}
			{source.status === "empty" && (
				<p className="px-3 py-3 text-muted text-xs">{t.card.noData}</p>
			)}
			{source.status === "skipped" && (
				<p className="px-3 py-3 text-muted text-xs">{t.card.quotaExhausted}</p>
			)}

			{d && (
				<div className="space-y-3 p-3">
					<div className="grid border border-border/60 bg-panel/70 md:grid-cols-4 md:divide-x md:divide-border/60">
						<div className="border-border/60 border-b p-2 md:border-b-0">
							<div className="mb-2 flex items-center justify-between gap-2">
								<span className="text-muted text-[11px] uppercase">
									{t.card.risk}
								</span>
								<span
									className={`font-bold text-xs ${riskColor(d.risk_level)}`}
								>
									{d.risk_score === null
										? t.report.noScore
										: formatRiskScore(d.risk_score)}
								</span>
							</div>
							<ScoreBar score={d.risk_score} level={d.risk_level} />
						</div>
						<div className="border-border/60 border-b p-2 md:border-b-0">
							<div className="text-muted text-[11px] uppercase">
								{t.report.colVerdict}
							</div>
							<div className={`mt-1 text-xs ${TONE_CLASS[sourceVerdict.tone]}`}>
								{sourceVerdict.text}
							</div>
						</div>
						<div className="border-border/60 border-b p-2 md:border-b-0">
							<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
								<span className="text-muted">{t.card.status}</span>
								<span className="text-right text-fg">{source.status}</span>
								<span className="text-muted">{t.card.latency}</span>
								<span className="text-right text-fg">
									{source.durationMs}ms
								</span>
							</div>
						</div>
						<div className="flex items-center p-2">
							<a
								href={source.sourceUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-phosphor text-xs hover:underline"
							>
								{t.card.viewAtSource}
							</a>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<section className="border border-border/60 bg-bg/30 p-3">
							<div className="mb-2 text-muted text-[11px] uppercase">
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
													: "border-border text-muted"
											}`}
										>
											{t.signal[labelKey]}
										</span>
									);
								})}
							</div>
						</section>
						<section className="space-y-2 border border-border/60 bg-bg/30 p-3 text-xs">
							<div className="text-muted text-[11px] uppercase">
								{t.fields.riskReasons}
							</div>
							{d.blocklists.length > 0 && (
								<div className="text-danger">
									{t.card.listed} {d.blocklists.join(", ")}
								</div>
							)}
							{d.risk_reasons.length > 0 && (
								<div className="text-amber">{d.risk_reasons.join(", ")}</div>
							)}
							{d.blocklists.length === 0 && d.risk_reasons.length === 0 && (
								<div className="text-muted">{t.card.noAdditionalReasons}</div>
							)}
						</section>
					</div>

					<section className="border border-border/60 bg-bg/30 p-3">
						<div className="mb-2 text-muted text-[11px] uppercase">
							{t.card.evidence}
						</div>
						{fields.length > 0 ? (
							<dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
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
					</section>
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
			<div className="hidden grid-cols-[1.25rem_9rem_minmax(11rem,0.9fr)_minmax(10rem,0.8fr)_minmax(15rem,1.2fr)] items-center border-border border-b bg-panel-2 text-center text-[11px] text-muted uppercase tracking-wider lg:grid">
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
							className={`grid w-full cursor-pointer grid-cols-[1.25rem_1fr] gap-x-2 gap-y-2 border border-transparent py-3 text-left outline-none hover:bg-panel-2/60 focus-visible:bg-panel-2 focus-visible:ring-1 focus-visible:ring-phosphor-dim lg:items-center lg:gap-0 lg:py-0 ${
								expanded
									? "border-phosphor-dim bg-panel-2 lg:grid-cols-[1.25rem_1fr]"
									: "lg:grid-cols-[1.25rem_9rem_minmax(11rem,0.9fr)_minmax(10rem,0.8fr)_minmax(15rem,1.2fr)]"
							}`}
						>
							<span
								className="flex h-full items-start justify-center px-2 pt-0.5 text-phosphor text-xs lg:items-center lg:py-3 lg:pt-3"
								aria-hidden="true"
							>
								{expanded ? "▾" : "▸"}
							</span>
							<div
								className={`min-w-0 pr-3 lg:w-full lg:border-border/55 lg:border-l lg:px-3 lg:py-3 ${
									expanded ? "lg:border-r" : ""
								}`}
							>
								<span className="break-words font-bold text-fg text-xs">
									{source.name}
								</span>
							</div>
							{!expanded && (
								<>
									<div className="col-start-2 min-w-0 pr-3 lg:col-start-auto lg:flex lg:w-full lg:justify-center lg:border-border/55 lg:border-l lg:px-3 lg:py-3">
										<ScoreMeter score={score} level={d?.risk_level ?? null} />
									</div>
									<div className="col-start-2 pr-3 lg:col-start-auto lg:flex lg:w-full lg:justify-center lg:border-border/55 lg:border-l lg:px-3 lg:py-3">
										<SignalChips
											data={d}
											t={t}
											compact
											className="lg:justify-center"
										/>
									</div>
									<span
										className={`col-start-2 break-words pr-3 text-xs leading-relaxed lg:col-start-auto lg:w-full lg:border-border/55 lg:border-l lg:px-3 lg:py-3 ${TONE_CLASS[v.tone]}`}
									>
										{v.text}
									</span>
								</>
							)}
						</button>
						{expanded && <DetailPanel source={source} />}
					</div>
				);
			})}
		</div>
	);
}
