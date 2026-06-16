import type { Consensus, IpReport } from "@howismyip/core";
import { useState } from "react";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { countryDisplay, orDash } from "../lib/format";
import { RiskMatrix } from "./risk-matrix";
import { SourceCard } from "./source-card";

function Summary({ c, t }: { c: Consensus; t: Dictionary }) {
	const rows = (
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
		] as Array<[string, string | null]>
	).filter(([, v]) => Boolean(v));

	return (
		<div className="space-y-3">
			{c.blocklists.length > 0 && (
				<div className="text-danger text-xs">
					{t.report.onBlocklists} {c.blocklists.join(", ")}
				</div>
			)}
			<dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
				{rows.map(([label, value]) => (
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
					<Summary c={report.consensus} t={t} />
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
