import { createFileRoute } from "@tanstack/react-router";
import { Banner } from "../../components/banner";
import { IpSearch } from "../../components/ip-search";
import { ReportView } from "../../components/report-view";
import { useT } from "../../i18n/use-t";
import { lookupIpFn } from "../../server/lookup";

export const Route = createFileRoute("/$lang/$ip")({
	loader: ({ params }) => lookupIpFn({ data: params.ip }),
	component: IpDetail,
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
