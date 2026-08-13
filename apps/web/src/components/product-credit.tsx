import { useLocale, useT } from "../i18n/use-t";
import { trackRelatedProductClick } from "../lib/analytics";

const STATIC_ISP_PATH = "/proxies/static-isp";

export function staticIspUrl(locale: "en" | "zh") {
	const path = locale === "zh" ? `/zh${STATIC_ISP_PATH}` : STATIC_ISP_PATH;
	const params = new URLSearchParams({
		utm_source: "howismyip",
		utm_medium: "referral",
		utm_campaign: "static_isp",
		utm_content: "footer_credit",
	});
	return `https://s1.dev${path}?${params}`;
}

/** A restrained ownership credit and related-product entry point. */
export function ProductCredit() {
	const locale = useLocale();
	const t = useT();
	const destination = staticIspUrl(locale);

	return (
		<footer className="mt-12 border-border border-t pt-4">
			<div className="flex items-center justify-between gap-3 sm:gap-6">
				<div className="min-w-0 space-y-1">
					<p className="text-[10px] tracking-[0.12em] text-muted uppercase">
						{t.relatedProduct.providedBy}{" "}
						<span className="font-bold tracking-normal text-phosphor normal-case">
							Search1API
						</span>
					</p>
					<p className="text-xs font-bold text-fg">{t.relatedProduct.title}</p>
					<p className="text-[11px] leading-relaxed text-muted">
						{t.relatedProduct.description}
					</p>
				</div>

				<a
					href={destination}
					target="_blank"
					rel="noreferrer sponsored"
					onClick={() =>
						trackRelatedProductClick({
							product: "static_isp",
							placement: "footer_credit",
							destination,
							language: locale,
						})
					}
					className="w-fit shrink-0 text-xs whitespace-nowrap"
				>
					{t.relatedProduct.cta} →
				</a>
			</div>
		</footer>
	);
}
