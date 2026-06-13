import type { Consensus, IpReport } from "@howismyip/core";
import { useState } from "react";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { countryDisplay, orDash, riskColor } from "../lib/format";
import { RiskMatrix } from "./risk-matrix";
import { SourceCard } from "./source-card";

const CONSENSUS_FLAGS: Array<[keyof Consensus, string]> = [
	["is_proxy", "PROXY"],
	["is_vpn", "VPN"],
	["is_tor", "TOR"],
	["is_hosting", "HOSTING"],
	["is_mobile", "MOBILE"],
];

function Verdict({ c, t }: { c: Consensus; t: Dictionary }) {
	const flags = CONSENSUS_FLAGS.filter(([key]) => c[key] === true);
	const level = c.risk_level ? t.risk[c.risk_level] : orDash(null);
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span className="text-muted text-xs">{t.report.consensus}</span>
				<span className={`font-bold text-2xl ${riskColor(c.risk_level)}`}>
					{c.risk_score === null ? "n/a" : c.risk_score}
					<span className="text-base"> {t.report.of100}</span>
				</span>
				<span className={`text-sm uppercase ${riskColor(c.risk_level)}`}>
					{level}
				</span>
				<span className="text-muted text-xs">
					{t.report.sourcesAgreed(c.source_count)}
				</span>
			</div>

			{flags.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{flags.map(([, label]) => (
						<span
							key={label}
							className="border border-danger px-2 py-0.5 text-danger text-xs"
						>
							{label}
						</span>
					))}
				</div>
			) : (
				<div className="text-phosphor text-xs">{t.report.noFlags}</div>
			)}

			{c.blocklists.length > 0 && (
				<div className="text-danger text-xs">
					{t.report.onBlocklists} {c.blocklists.join(", ")}
				</div>
			)}

			<dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
				{(
					[
						[
							t.report.location,
							c.country_name || c.city
								? `${orDash(c.city)} · ${countryDisplay(c.country_name, c.country_code)}`
								: null,
						],
						[t.report.asn, c.asn],
						[t.report.isp, c.isp],
						[t.report.org, c.organization],
						[t.report.rir, c.rir],
						[t.report.type, c.proxy_type],
					] as Array<[string, string | null]>
				)
					.filter(([, v]) => Boolean(v))
					.map(([label, value]) => (
						<div key={label}>
							<dt className="text-muted text-xs">{label}</dt>
							<dd className="break-words text-fg">{value}</dd>
						</div>
					))}
			</dl>
		</div>
	);
}

export function ReportView({ report }: { report: IpReport }) {
	const t = useT();
	const [showRaw, setShowRaw] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);

	function copy(kind: "json" | "curl") {
		const origin = typeof window === "undefined" ? "" : window.location.origin;
		const text =
			kind === "json"
				? JSON.stringify(report, null, 2)
				: `curl ${origin}/api/ip/${report.ip}`;
		navigator.clipboard?.writeText(text).then(() => {
			setCopied(kind);
			setTimeout(() => setCopied(null), 1500);
		});
	}

	const responded = report.sources.filter((s) => s.status === "ok").length;

	const riskSources = report.sources.filter(
		(s) => s.category === "risk" || s.category === "blocklist",
	);
	const networkSources = report.sources.filter(
		(s) => s.category === "geo" || s.category === "network",
	);
	const registrySources = report.sources.filter(
		(s) => s.category === "registry",
	);

	return (
		<div className="space-y-5">
			<div className="border border-border bg-panel">
				<div className="flex flex-wrap items-center justify-between gap-2 border-border border-b bg-panel-2 px-4 py-2">
					<span className="font-bold text-fg text-lg">{report.ip}</span>
					<div className="flex gap-2 text-xs">
						<button
							type="button"
							onClick={() => copy("curl")}
							className="border border-border px-2 py-1 text-muted hover:border-phosphor-dim hover:text-fg"
						>
							{copied === "curl" ? t.report.copied : t.report.copyCurl}
						</button>
						<button
							type="button"
							onClick={() => copy("json")}
							className="border border-border px-2 py-1 text-muted hover:border-phosphor-dim hover:text-fg"
						>
							{copied === "json" ? t.report.copied : t.report.copyJson}
						</button>
						<button
							type="button"
							onClick={() => setShowRaw((v) => !v)}
							className="border border-border px-2 py-1 text-muted hover:border-phosphor-dim hover:text-fg"
						>
							{showRaw ? t.report.hideSource : t.report.viewSource}
						</button>
					</div>
				</div>
				<div className="px-4 py-3">
					<Verdict c={report.consensus} t={t} />
				</div>
			</div>

			{showRaw && (
				<pre className="max-h-[28rem] overflow-auto border border-border bg-panel p-3 text-cyan text-xs">
					{JSON.stringify(report, null, 2)}
				</pre>
			)}

			<div className="text-muted text-xs">
				{t.report.queried(report.sources.length, responded)}
			</div>

			{riskSources.length > 0 && (
				<section>
					<h2 className="mb-2 text-muted text-xs">{t.report.sectionRisk}</h2>
					<RiskMatrix sources={riskSources} />
				</section>
			)}

			{networkSources.length > 0 && (
				<section>
					<h2 className="mb-2 text-muted text-xs">{t.report.sectionNetwork}</h2>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{networkSources.map((source) => (
							<SourceCard key={source.id} source={source} />
						))}
					</div>
				</section>
			)}

			{registrySources.length > 0 && (
				<section>
					<h2 className="mb-2 text-muted text-xs">
						{t.report.sectionRegistry}
					</h2>
					<div className="grid gap-3 sm:grid-cols-2">
						{registrySources.map((source) => (
							<SourceCard key={source.id} source={source} />
						))}
					</div>
				</section>
			)}
		</div>
	);
}
