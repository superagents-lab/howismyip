import { createFileRoute } from "@tanstack/react-router";
import { Banner } from "../../components/banner";
import { IpSearch } from "../../components/ip-search";
import { getDictionary, isLocale } from "../../i18n/messages";
import { useLocale, useT } from "../../i18n/use-t";
import { categoryColor } from "../../lib/format";
import { listProvidersFn } from "../../server/lookup";

export const Route = createFileRoute("/$lang/")({
	loader: () => listProvidersFn(),
	component: Home,
	head: ({ params }) => {
		const dict = getDictionary(isLocale(params.lang) ? params.lang : "en");
		return {
			meta: [
				{ title: dict.meta.title },
				{ name: "description", content: dict.meta.description },
			],
		};
	},
});

function Home() {
	const providers = Route.useLoaderData();
	const t = useT();
	const locale = useLocale();
	const keyless = providers.filter((p) => !p.requiresKey);
	const keyed = providers.filter((p) => p.requiresKey);
	const activeCount = providers.filter((p) => p.enabled).length;

	return (
		<main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
			<Banner />

			<section className="mb-8">
				<IpSearch />
				<p className="mt-2 text-muted text-xs">{t.search.hint}</p>
			</section>

			<section className="border border-border bg-panel p-4">
				<h2 className="mb-3 text-muted text-xs uppercase tracking-wider">
					{t.home.sourcesTitle(activeCount, providers.length)}
				</h2>
				<ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
					{[...keyless, ...keyed].map((p) => (
						<li key={p.id} className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-2">
								<span className={p.enabled ? "text-phosphor" : "text-muted"}>
									{p.enabled ? "●" : "○"}
								</span>
								<span className={p.enabled ? "text-fg" : "text-muted"}>
									{p.name}
								</span>
								<span
									className={`text-[11px] uppercase ${categoryColor(p.category)}`}
								>
									{t.category[p.category]}
								</span>
							</span>
							<span className="text-muted text-[11px]">
								{p.requiresKey
									? p.enabled
										? t.home.keyed
										: t.home.needsKey
									: t.home.keyless}
							</span>
						</li>
					))}
				</ul>
				<p className="mt-3 text-muted text-xs">
					{t.home.note} <code className="text-cyan">.env.example</code>.
				</p>
			</section>

			<footer className="mt-8 text-muted text-xs">
				{t.home.footerAccess}{" "}
				<code className="text-cyan">curl {"{origin}"}/api/ip/8.8.8.8</code>{" "}
				{t.home.footerOpenSource} · <code className="text-cyan">/{locale}</code>
			</footer>
		</main>
	);
}
