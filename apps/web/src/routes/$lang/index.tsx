import { createFileRoute } from "@tanstack/react-router";
import { Banner } from "../../components/banner";
import { IpSearch } from "../../components/ip-search";
import { ProductCredit } from "../../components/product-credit";
import { getDictionary, isLocale } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { categoryColor } from "../../lib/format";
import { buildSocialMeta, SITE_ORIGIN } from "../../lib/social-meta";
import { listProvidersFn } from "../../server/lookup";

export const Route = createFileRoute("/$lang/")({
	loader: () => listProvidersFn(),
	component: Home,
	head: ({ params }) => {
		const locale = isLocale(params.lang) ? params.lang : "en";
		const dict = getDictionary(locale);
		const url = `${SITE_ORIGIN}/${locale}`;
		return {
			meta: buildSocialMeta({
				title: dict.meta.title,
				description: dict.meta.description,
				url,
				imageAlt: dict.meta.imageAlt,
				locale,
			}),
			links: [{ rel: "canonical", href: url }],
		};
	},
});

function Home() {
	const providers = Route.useLoaderData();
	const t = useT();

	return (
		<main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
			<Banner />

			<section className="mb-8">
				<IpSearch />
			</section>

			<section
				aria-label={t.home.sourcesLabel}
				className="border border-border bg-panel p-4"
			>
				<ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
					{providers.map((p) => (
						<li key={p.id} className="flex items-center gap-2">
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
						</li>
					))}
				</ul>
			</section>

			<ProductCredit />
		</main>
	);
}
