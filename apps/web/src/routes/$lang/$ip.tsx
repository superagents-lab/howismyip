import { createFileRoute } from "@tanstack/react-router";
import { Banner } from "../../components/banner";
import { IpSearch, QueryLoader } from "../../components/ip-search";
import { ReportView } from "../../components/report-view";
import { useT } from "../../i18n/use-t";
import { lookupIpFn } from "../../server/lookup";

export const Route = createFileRoute("/$lang/$ip")({
	loader: ({ params }) => lookupIpFn({ data: params.ip }),
	component: IpDetail,
	pendingComponent: IpPending,
	pendingMs: 0,
	pendingMinMs: 350,
	head: ({ params }) => ({
		meta: [{ title: `${params.ip} · howismyip` }],
	}),
});

function IpDetail() {
	const { report, errorCode } = Route.useLoaderData();
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
			{report && <ReportView report={report} />}
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
