import type { FactSummary, IpReport } from "@howismyip/core";
import { useState } from "react";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { RiskMatrix } from "./risk-matrix";

function primaryFactValue(fact: FactSummary) {
	return [...fact.values].sort(
		(a, b) => b.sources.length - a.sources.length,
	)[0];
}

function BasicFacts({ facts, t }: { facts: FactSummary[]; t: Dictionary }) {
	const [expandedFact, setExpandedFact] = useState<string | null>(null);
	const sourceCount = new Set(
		facts.flatMap((fact) => fact.values.flatMap((value) => value.sources)),
	).size;

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3 border-border border-b pb-2">
				<h2 className="text-muted text-xs">{t.report.sectionFacts}</h2>
				<span className="text-muted text-[11px]">
					{sourceCount} {t.report.sources}
				</span>
			</div>
			{facts.length === 0 && (
				<p className="text-muted text-xs">{t.report.noFacts}</p>
			)}
			<div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
				{facts.map((fact) => {
					const primary = primaryFactValue(fact);
					const expanded = expandedFact === fact.key;
					const toggle = () => setExpandedFact(expanded ? null : fact.key);
					return (
						<button
							type="button"
							key={fact.key}
							data-testid={`fact-sources-${fact.key}`}
							aria-expanded={expanded}
							onClick={toggle}
							className={`grid w-full cursor-pointer grid-cols-[6rem_1fr] items-start gap-3 border-border/50 border-b border-l-2 py-2 pl-2 text-left outline-none last:border-b-0 hover:bg-panel-2/60 focus-visible:bg-panel-2 focus-visible:ring-1 focus-visible:ring-phosphor-dim sm:last:border-b ${
								expanded
									? "border-l-phosphor-dim bg-panel-2/70"
									: "border-l-transparent"
							}`}
						>
							<span className="text-muted text-xs">{t.fact[fact.key]}</span>
							<span className="min-w-0">
								<div className="break-words text-fg">{primary?.value}</div>
								<div className="mt-0.5 flex flex-wrap items-center gap-2 text-muted text-[11px]">
									<span>
										{primary?.sources.length ?? 0} {t.report.sources}
									</span>
									{primary && (
										<span className="text-phosphor">
											{expanded ? "▾" : "▸"}
										</span>
									)}
								</div>
								{expanded && primary && (
									<div className="mt-2 flex flex-wrap gap-1.5">
										{primary.sources.map((source) => (
											<span
												key={source}
												className="border border-border px-1.5 py-0.5 text-muted text-[11px]"
											>
												{source}
											</span>
										))}
									</div>
								)}
							</span>
						</button>
					);
				})}
			</div>
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
		(s) =>
			(s.category === "risk" || s.category === "blocklist") &&
			s.status === "ok" &&
			s.data,
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
					<BasicFacts facts={report.facts} t={t} />
				</div>
			</div>

			{showRaw && (
				<pre className="max-h-[28rem] overflow-auto border border-border bg-panel p-3 text-cyan text-xs">
					{JSON.stringify(report, null, 2)}
				</pre>
			)}

			<div className="text-muted text-xs">
				{t.report.queried(report.sources.length, responded, riskSources.length)}
			</div>

			{riskSources.length > 0 && (
				<section>
					<h2 className="mb-2 text-muted text-xs">{t.report.sectionRisk}</h2>
					<RiskMatrix sources={riskSources} />
				</section>
			)}
		</div>
	);
}
