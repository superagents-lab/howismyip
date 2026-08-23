import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Banner } from "../../components/banner";
import { IpSearch, QueryLoader } from "../../components/ip-search";
import { ProductCredit } from "../../components/product-credit";
import { ReportView } from "../../components/report-view";
import { getDictionary, isLocale } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import {
	ensureLookupStarted,
	inferIpVersion,
	type LookupOutcome,
	trackLookupCompleted,
} from "../../lib/analytics";
import {
	buildSocialMeta,
	ogImageUrlForIp,
	SITE_ORIGIN,
} from "../../lib/social-meta";
import { type LookupResult, lookupIpFn } from "../../server/lookup";

export const Route = createFileRoute("/$lang/$ip")({
	component: IpPage,
	head: ({ params }) => {
		const locale = isLocale(params.lang) ? params.lang : "en";
		const dict = getDictionary(locale);
		const title = `${params.ip} · howismyip`;
		const url = `${SITE_ORIGIN}/${locale}/${params.ip}`;
		return {
			meta: buildSocialMeta({
				title,
				description: dict.meta.ipDescription(params.ip),
				url,
				imageAlt: dict.meta.imageAlt,
				locale,
				ogImage: ogImageUrlForIp(params.ip),
			}),
			links: [{ rel: "canonical", href: url }],
		};
	},
});

interface LookupState {
	ip: string;
	result?: LookupResult;
}

function lookupOutcome(errorCode: LookupResult["errorCode"]): LookupOutcome {
	if (errorCode === "invalid") return "invalid";
	if (errorCode === "rateLimited") return "rate_limited";
	if (errorCode === "failed") return "failed";
	return "success";
}

function IpPage() {
	const { ip } = Route.useParams();
	const [lookup, setLookup] = useState<LookupState>(() => ({ ip }));

	useEffect(() => {
		let active = true;
		ensureLookupStarted({
			mode: "direct",
			ipVersion: inferIpVersion(ip),
		});
		setLookup({ ip });

		lookupIpFn({ data: ip }).then(
			(result) => {
				if (active) {
					setLookup({ ip, result });
				}
			},
			() => {
				if (active) {
					setLookup({
						ip,
						result: { report: null, errorCode: "failed" },
					});
				}
			},
		);

		return () => {
			active = false;
		};
	}, [ip]);

	useEffect(() => {
		if (lookup.ip !== ip || !lookup.result) return;
		const { report, errorCode, telemetry } = lookup.result;
		trackLookupCompleted({
			outcome: lookupOutcome(errorCode),
			ipVersion: inferIpVersion(ip),
			cacheStatus: telemetry?.cacheStatus,
			serverDurationMs: telemetry?.serverDurationMs,
			providers: report?.sources,
		});
	}, [ip, lookup]);

	if (lookup.ip !== ip || !lookup.result) {
		return <IpPending />;
	}

	return <IpDetail result={lookup.result} />;
}

function IpDetail({ result }: { result: LookupResult }) {
	const { report, errorCode } = result;
	const { ip } = Route.useParams();
	const t = useT();
	const errorText =
		errorCode === "invalid"
			? t.error.invalid(ip)
			: errorCode === "rateLimited"
				? t.error.rateLimited
				: errorCode
					? t.error.failed
					: null;

	return (
		<main className="mx-auto max-w-5xl px-4 py-8">
			<Banner />
			<section className="mb-6">
				<IpSearch initial={ip} />
			</section>
			{errorText && (
				<div className="border border-danger/60 bg-panel p-4 text-danger">
					! {errorText}
				</div>
			)}
			{report && (
				<>
					<ReportView report={report} />
					<ProductCredit />
				</>
			)}
		</main>
	);
}

function IpPending() {
	const { ip } = Route.useParams();
	const t = useT();

	return (
		<main className="mx-auto max-w-5xl px-4 py-8">
			<Banner />
			<section className="mb-6">
				<IpSearch initial={ip} />
			</section>
			<QueryLoader label={t.search.searching} detail={t.search.loadingDetail} />
			<div className="mt-3 grid gap-2 sm:grid-cols-3">
				{[0, 1, 2].map((item) => (
					<div
						key={item}
						className="space-y-2 border border-border bg-panel p-3"
					>
						<div className="h-2 w-20 bg-border/70" />
						<div className="h-2 w-full bg-border/45" />
						<div className="h-2 w-2/3 bg-border/35" />
					</div>
				))}
			</div>
		</main>
	);
}
