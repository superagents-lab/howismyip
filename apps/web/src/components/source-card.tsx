import type { IpIntelligence, ProviderResult } from "@howismyip/core";
import type { Dictionary } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import {
	categoryColor,
	countryDisplay,
	orDash,
	riskColor,
} from "../lib/format";

/** Stacked field: small label on top, value below (full width). */
function FieldRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-border/50 border-b py-1.5 last:border-b-0">
			<div className="text-[11px] text-muted">{label}</div>
			<div className="break-words text-fg">{value}</div>
		</div>
	);
}

/** Build the ordered, non-empty field rows for one source record. */
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
		[f.continent, d.continent_name],
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

const FLAG_DEFS: Array<[keyof IpIntelligence, string]> = [
	["is_proxy", "PROXY"],
	["is_vpn", "VPN"],
	["is_tor", "TOR"],
	["is_hosting", "HOSTING"],
	["is_mobile", "MOBILE"],
];

function Flags({ d }: { d: IpIntelligence }) {
	const flags = FLAG_DEFS.filter(([key]) => d[key] === true);
	if (flags.length === 0) {
		return null;
	}
	return (
		<div className="mt-2 flex flex-wrap gap-1">
			{flags.map(([, label]) => (
				<span
					key={label}
					className="border border-danger/60 px-1.5 py-0.5 text-[11px] text-danger"
				>
					{label}
				</span>
			))}
		</div>
	);
}

const STATUS_STYLE: Record<ProviderResult["status"], string> = {
	ok: "text-phosphor border-phosphor-dim",
	empty: "text-muted border-border",
	error: "text-danger border-danger/60",
	skipped: "text-muted border-border",
};

export function SourceCard({ source }: { source: ProviderResult }) {
	const t = useT();
	const d = source.data;
	const fields = d ? fieldsFor(d, t) : [];
	const hasFlags = d ? FLAG_DEFS.some(([key]) => d[key] === true) : false;
	const notListed =
		d !== null && source.category === "blocklist" && d.blocklists.length === 0;
	const notTor = d !== null && source.id === "tor" && d.is_tor === false;
	const clean =
		d !== null &&
		d.risk_score === null &&
		d.blocklists.length === 0 &&
		!(hasFlags || notListed || notTor) &&
		fields.length === 0;
	return (
		<div className="flex flex-col border border-border bg-panel">
			<div className="border-border border-b bg-panel-2 px-3 py-2">
				<div className="flex items-start justify-between gap-2">
					<span
						className="line-clamp-2 min-h-[2.4rem] flex-1 font-bold text-fg text-sm leading-snug"
						title={source.name}
					>
						{source.name}
					</span>
					<span
						className={`shrink-0 border px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[source.status]}`}
					>
						{source.status}
					</span>
				</div>
				<div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
					<span className="flex min-w-0 items-center gap-2">
						<span className={`uppercase ${categoryColor(source.category)}`}>
							{t.category[source.category]}
						</span>
						<a
							href={source.sourceUrl}
							target="_blank"
							rel="noreferrer"
							className="truncate text-muted hover:text-phosphor"
						>
							{t.card.viewAtSource}
						</a>
					</span>
					<span className="shrink-0 text-muted">{source.durationMs}ms</span>
				</div>
			</div>

			<div className="px-3 py-2 text-sm">
				{source.status === "error" && (
					<p className="text-danger text-xs">! {orDash(source.error)}</p>
				)}
				{source.status === "empty" && (
					<p className="text-muted text-xs">{t.card.noData}</p>
				)}
				{source.status === "skipped" && (
					<p className="text-muted text-xs">{t.card.quotaExhausted}</p>
				)}
				{d && (
					<>
						{d.risk_score !== null && (
							<div className="mb-1">
								<span className="text-muted text-xs">{t.card.risk} </span>
								<span className={`font-bold ${riskColor(d.risk_level)}`}>
									{d.risk_score}
									{d.risk_level ? ` · ${t.risk[d.risk_level]}` : ""}
								</span>
							</div>
						)}
						{d.blocklists.length > 0 && (
							<div className="mb-1 text-danger text-xs">
								{t.card.listed} {d.blocklists.join(", ")}
							</div>
						)}
						{notListed && (
							<div className="text-phosphor text-xs">✓ {t.card.notListed}</div>
						)}
						{notTor && (
							<div className="text-phosphor text-xs">✓ {t.card.notTor}</div>
						)}
						{clean && (
							<div className="text-phosphor text-xs">✓ {t.card.clean}</div>
						)}
						<Flags d={d} />
						{fields.length > 0 && (
							<div className="mt-2">
								{fields.map(([label, value]) => (
									<FieldRow key={label} label={label} value={value} />
								))}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
