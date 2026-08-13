import type { FactKey, FactSummary, IpReport } from "@howismyip/core";
import { useState } from "react";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { RiskMatrix } from "./risk-matrix";

function primaryFactValue(fact: FactSummary) {
	return [...fact.values].sort(
		(a, b) => b.sources.length - a.sources.length,
	)[0];
}

const PROVENANCE_KEYS = new Set<FactKey>([
	"registration_country",
	"rir",
	"allocation",
	"announced_prefix",
	"announcement",
	"origin_asn",
	"origin_holder",
	"rpki",
]);

const BASIC_FACT_ORDER: FactKey[] = [
	"country",
	"city",
	"region",
	"asn",
	"isp",
	"organization",
	"ptr",
];

function displayedFactValue(
	key: FactKey,
	value: string,
	t: Dictionary,
): string {
	if (key === "announcement") {
		return value === "announced"
			? t.factValue.announced
			: t.factValue.notAnnounced;
	}
	if (key === "rpki") {
		return t.factValue.rpki[value as keyof Dictionary["factValue"]["rpki"]];
	}
	return value;
}

function factFor(facts: FactSummary[], key: FactKey) {
	return facts.find((fact) => fact.key === key);
}

function primaryValue(facts: FactSummary[], key: FactKey) {
	const fact = factFor(facts, key);
	const primary = fact ? primaryFactValue(fact) : null;
	return primary?.value ?? null;
}

function sourceCount(facts: Array<FactSummary | undefined>) {
	return new Set(
		facts.flatMap((fact) =>
			fact ? fact.values.flatMap((value) => value.sources) : [],
		),
	).size;
}

function asnValues(fact: FactSummary | undefined) {
	return new Set(
		fact?.values.flatMap((value) =>
			value.value
				.split(",")
				.map((asn) => asn.trim().toUpperCase())
				.filter(Boolean),
		) ?? [],
	);
}

type EvidenceTone = "good" | "warn" | "bad" | "muted";

const EVIDENCE_TONE: Record<EvidenceTone, string> = {
	good: "text-phosphor",
	warn: "text-amber",
	bad: "text-danger",
	muted: "text-muted",
};

const EVIDENCE_BORDER: Record<Exclude<EvidenceTone, "good">, string> = {
	warn: "border-amber/70",
	bad: "border-danger/70",
	muted: "border-border/70",
};

interface EvidenceMeta {
	text: string;
	tone: EvidenceTone;
}

interface EvidenceDetail {
	label: string;
	fact: FactSummary | undefined;
}

interface ContextEvidence {
	label: string;
	value: string;
	meta: EvidenceMeta[];
	details: EvidenceDetail[];
	tone: Exclude<EvidenceTone, "good">;
}

function EvidenceDetails({
	details,
	t,
}: {
	details: EvidenceDetail[];
	t: Dictionary;
}) {
	return (
		<span className="mt-3 block space-y-2 border-border/60 border-t pt-2">
			{details.map(({ label, fact }) => {
				if (!fact || fact.values.length === 0) {
					return null;
				}
				return (
					<span key={fact.key} className="grid gap-1 sm:grid-cols-[7.5rem_1fr]">
						<span className="text-muted text-[11px]">{label}</span>
						<span className="min-w-0 space-y-1">
							{fact.values.map((factValue) => (
								<span
									key={factValue.value}
									className="flex min-w-0 flex-wrap items-baseline gap-x-2"
								>
									<span className="break-words text-fg text-xs">
										{displayedFactValue(fact.key, factValue.value, t)}
									</span>
									<span className="min-w-0 break-words text-muted text-[11px]">
										{factValue.sources.join(", ")}
									</span>
								</span>
							))}
						</span>
					</span>
				);
			})}
		</span>
	);
}

function FactGrid({
	facts,
	t,
	expandedFact,
	setExpandedFact,
}: {
	facts: FactSummary[];
	t: Dictionary;
	expandedFact: string | null;
	setExpandedFact: (key: string | null) => void;
}) {
	return (
		<div className="grid items-start gap-x-6 gap-y-2 sm:grid-cols-2">
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
						className={`grid w-full cursor-pointer grid-cols-[6rem_1fr] items-start gap-3 border px-2 py-2 text-left outline-none hover:bg-panel-2/60 focus-visible:bg-panel-2 focus-visible:ring-1 focus-visible:ring-phosphor-dim ${
							expanded
								? "border-phosphor-dim bg-panel-2/70"
								: "border-transparent border-b-border/50"
						}`}
					>
						<span className="text-muted text-xs">{t.fact[fact.key]}</span>
						<span className="min-w-0">
							<div className="break-words text-fg">
								{primary && displayedFactValue(fact.key, primary.value, t)}
							</div>
							<div className="mt-0.5 flex flex-wrap items-center gap-2 text-muted text-[11px]">
								<span>
									{primary?.sources.length ?? 0} {t.report.sources}
								</span>
								{fact.conflict && (
									<span className="text-amber">{t.report.conflict}</span>
								)}
								{primary && (
									<span className="text-phosphor">{expanded ? "▾" : "▸"}</span>
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
	);
}

function EvidenceStripRow({
	id,
	evidence,
	t,
	expanded,
	onToggle,
}: {
	id: string;
	evidence: ContextEvidence;
	t: Dictionary;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			data-testid={`network-evidence-${id}`}
			aria-expanded={expanded}
			onClick={onToggle}
			className={`grid w-full cursor-pointer grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 border px-2 py-2.5 text-left outline-none hover:bg-panel-2/60 focus-visible:bg-panel-2 focus-visible:ring-1 focus-visible:ring-phosphor-dim ${
				expanded
					? "border-phosphor-dim bg-panel-2/70"
					: "border-transparent border-b-border/50"
			}`}
		>
			<span
				className={`border-l-2 pl-2 text-xs ${EVIDENCE_BORDER[evidence.tone]}`}
			>
				{evidence.label}
			</span>
			<span className="min-w-0">
				<span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="break-words text-fg">{evidence.value}</span>
					{evidence.meta.map((item) => (
						<span
							key={`${item.text}-${item.tone}`}
							className={`text-[11px] ${EVIDENCE_TONE[item.tone]}`}
						>
							{item.text}
						</span>
					))}
					<span className="text-phosphor text-[11px]">
						{expanded ? "▾" : "▸"}
					</span>
				</span>
				{expanded && <EvidenceDetails details={evidence.details} t={t} />}
			</span>
		</button>
	);
}

function NetworkEvidenceBar({
	contextEvidence,
	t,
}: {
	contextEvidence: Partial<Record<FactKey, ContextEvidence>>;
	t: Dictionary;
}) {
	const [expanded, setExpanded] = useState<string | null>(null);
	const rows = [
		{ id: "registration", evidence: contextEvidence.country },
		{ id: "route", evidence: contextEvidence.asn },
	].filter((row): row is { id: string; evidence: ContextEvidence } =>
		Boolean(row.evidence),
	);

	if (rows.length === 0) {
		return null;
	}

	return (
		<div
			data-testid="network-evidence"
			className="mt-3 border-border border-t pt-1"
		>
			{rows.map(({ id, evidence }) => (
				<EvidenceStripRow
					key={id}
					id={id}
					evidence={evidence}
					t={t}
					expanded={expanded === id}
					onToggle={() =>
						setExpanded((current) => (current === id ? null : id))
					}
				/>
			))}
		</div>
	);
}

function buildContextEvidence(
	report: IpReport,
	t: Dictionary,
): Partial<Record<FactKey, ContextEvidence>> {
	const { facts, consensus } = report;
	const registrationCountry = factFor(facts, "registration_country");
	const rir = factFor(facts, "rir");
	const allocation = factFor(facts, "allocation");
	const announcedPrefix = factFor(facts, "announced_prefix");
	const announcement = factFor(facts, "announcement");
	const originAsn = factFor(facts, "origin_asn");
	const originHolder = factFor(facts, "origin_holder");
	const rpki = factFor(facts, "rpki");

	const registeredValue = primaryValue(facts, "registration_country");
	const rirValue = primaryValue(facts, "rir");
	const allocationValue = primaryValue(facts, "allocation");
	const originValue = primaryValue(facts, "origin_asn");
	const prefixValue = primaryValue(facts, "announced_prefix");
	const announcementValue = primaryValue(facts, "announcement");
	const rpkiValue = primaryValue(facts, "rpki");

	const registrationFacts = [registrationCountry, rir, allocation];
	const routeFacts = [
		announcedPrefix,
		announcement,
		originAsn,
		originHolder,
		rpki,
	];
	const hasRegistration = registrationFacts.some(Boolean);
	const hasRoute = routeFacts.some(Boolean);
	const baseAsns = asnValues(factFor(facts, "asn"));
	const routeAsns = asnValues(originAsn);
	const routeMatchesBasic =
		baseAsns.size > 0 &&
		routeAsns.size > 0 &&
		[...routeAsns].some((asn) => baseAsns.has(asn));

	const registrationMeta: EvidenceMeta[] = [
		{
			text: t.provenance.sourceCount(sourceCount(registrationFacts)),
			tone: "muted",
		},
	];
	if (consensus.country_code && consensus.registered_country_code) {
		registrationMeta.push(
			consensus.country_code === consensus.registered_country_code
				? { text: t.provenance.matchesLocation, tone: "good" }
				: { text: t.provenance.differsLocation, tone: "warn" },
		);
	}
	if (registrationFacts.some((fact) => fact?.conflict)) {
		registrationMeta.push({ text: t.report.conflict, tone: "warn" });
	}
	const registrationDiffers =
		Boolean(consensus.country_code) &&
		Boolean(consensus.registered_country_code) &&
		consensus.country_code !== consensus.registered_country_code;

	const routeMeta: EvidenceMeta[] = [
		{ text: t.provenance.sourceCount(sourceCount(routeFacts)), tone: "muted" },
	];
	if (routeAsns.size > 1) {
		routeMeta.push({ text: t.provenance.multipleOrigins, tone: "warn" });
	}
	if (baseAsns.size > 0 && routeAsns.size > 0) {
		routeMeta.push(
			routeMatchesBasic
				? { text: t.provenance.matchesBasicAsn, tone: "good" }
				: { text: t.provenance.differsBasicAsn, tone: "bad" },
		);
	}
	if (announcementValue) {
		routeMeta.push({
			text: displayedFactValue("announcement", announcementValue, t),
			tone: announcementValue === "announced" ? "good" : "warn",
		});
	}
	if (rpkiValue) {
		routeMeta.push({
			text: `RPKI ${displayedFactValue("rpki", rpkiValue, t)}`,
			tone:
				rpkiValue === "valid"
					? "good"
					: rpkiValue === "unknown"
						? "muted"
						: "bad",
		});
	}
	// Holder names commonly differ only in punctuation/suffixes across routing
	// registries. Keep those variants visible when expanded, but only flag a
	// route conflict for topology or validation facts.
	if (
		[announcedPrefix, announcement, originAsn, rpki].some(
			(fact) => fact?.conflict,
		)
	) {
		routeMeta.push({ text: t.report.conflict, tone: "warn" });
	}

	const result: Partial<Record<FactKey, ContextEvidence>> = {};

	if (hasRegistration) {
		result.country = {
			label: t.provenance.registration,
			value:
				[registeredValue, rirValue, allocationValue]
					.filter(Boolean)
					.join(" · ") || t.provenance.unknown,
			meta: registrationMeta,
			details: [
				{
					label: t.fact.registration_country,
					fact: registrationCountry,
				},
				{ label: t.fact.rir, fact: rir },
				{ label: t.fact.allocation, fact: allocation },
			],
			tone:
				registrationDiffers || registrationFacts.some((fact) => fact?.conflict)
					? "warn"
					: "muted",
		};
	}

	if (hasRoute) {
		const invalidRpki =
			Boolean(rpkiValue) && rpkiValue !== "valid" && rpkiValue !== "unknown";
		const routeConflict = [announcedPrefix, announcement, originAsn, rpki].some(
			(fact) => fact?.conflict,
		);
		const severeRouteIssue =
			(baseAsns.size > 0 && routeAsns.size > 0 && !routeMatchesBasic) ||
			invalidRpki;
		const routeWarning =
			routeAsns.size > 1 ||
			announcementValue === "not_announced" ||
			routeConflict;

		result.asn = {
			label: t.provenance.route,
			value:
				originValue && prefixValue
					? `${originValue} → ${prefixValue}`
					: (originValue ?? prefixValue ?? t.provenance.unknown),
			meta: routeMeta,
			details: [
				{ label: t.fact.origin_asn, fact: originAsn },
				{ label: t.fact.origin_holder, fact: originHolder },
				{ label: t.fact.announced_prefix, fact: announcedPrefix },
				{ label: t.fact.announcement, fact: announcement },
				{ label: t.fact.rpki, fact: rpki },
			],
			tone: severeRouteIssue ? "bad" : routeWarning ? "warn" : "muted",
		};
	}

	return result;
}

function BasicFacts({ report, t }: { report: IpReport; t: Dictionary }) {
	const [expandedFact, setExpandedFact] = useState<string | null>(null);
	const { facts } = report;
	const contextEvidence = buildContextEvidence(report, t);
	const identityByKey = new Map(
		facts
			.filter((fact) => !PROVENANCE_KEYS.has(fact.key))
			.map((fact) => [fact.key, fact]),
	);

	const identity = BASIC_FACT_ORDER.flatMap((key) => {
		const fact = identityByKey.get(key);
		return fact ? [fact] : [];
	});

	return (
		<section className="space-y-3">
			<div className="border-border border-b pb-2">
				<h2 className="text-muted text-xs">{t.report.sectionFacts}</h2>
			</div>
			{identity.length > 0 ? (
				<FactGrid
					facts={identity}
					t={t}
					expandedFact={expandedFact}
					setExpandedFact={setExpandedFact}
				/>
			) : (
				<p className="text-muted text-xs">{t.report.noFacts}</p>
			)}
			<NetworkEvidenceBar contextEvidence={contextEvidence} t={t} />
		</section>
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

	// Only sources that actually returned an assessment are shown. A provider
	// paused because its quota is spent (status "skipped") says nothing about
	// this IP, so it stays out of the matrix — it remains in the raw report and
	// the JSON API for anyone who needs to know what wasn't consulted.
	const riskSources = report.sources.filter(
		(s) =>
			(s.category === "risk" || s.category === "blocklist") &&
			s.status === "ok" &&
			s.data,
	);
	const observedRiskLevels = riskSources.flatMap((source) =>
		source.data?.risk_level ? [source.data.risk_level] : [],
	);
	const highRiskCount = observedRiskLevels.filter(
		(level) => level === "high",
	).length;
	return (
		<div className="space-y-5">
			<div className="border border-border bg-panel">
				<div className="flex flex-wrap items-center justify-between gap-3 border-border border-b bg-panel-2 px-4 py-2">
					<div className="font-bold text-fg text-lg">{report.ip}</div>
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
					<BasicFacts report={report} t={t} />
				</div>
			</div>

			{showRaw && (
				<pre className="max-h-[28rem] overflow-auto border border-border bg-panel p-3 text-cyan text-xs">
					{JSON.stringify(report, null, 2)}
				</pre>
			)}

			{riskSources.length > 0 && (
				<section>
					<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-muted text-xs">{t.report.sectionRisk}</h2>
						<span
							className={
								highRiskCount > 0 ? "text-danger text-xs" : "text-muted text-xs"
							}
						>
							{t.report.riskSummary(highRiskCount, riskSources.length)}
						</span>
					</div>
					<RiskMatrix sources={riskSources} />
				</section>
			)}
		</div>
	);
}
