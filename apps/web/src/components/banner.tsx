import { Link, useParams } from "@tanstack/react-router";
import { locales } from "../i18n/messages";
import { useLocale, useT } from "../i18n/use-t";

const LABELS: Record<string, string> = { en: "EN", zh: "中" };

/** EN/中 switch that preserves the current page (home vs IP detail). */
function LangToggle() {
	const current = useLocale();
	const params = useParams({ strict: false }) as { ip?: string };
	return (
		<nav className="flex shrink-0 gap-2 text-xs">
			{locales.map((l) => (
				<Link
					key={l}
					to={params.ip ? "/$lang/$ip" : "/$lang"}
					params={params.ip ? { lang: l, ip: params.ip } : { lang: l }}
					className={
						l === current
							? "text-phosphor no-underline"
							: "text-muted hover:text-fg"
					}
				>
					{LABELS[l]}
				</Link>
			))}
		</nav>
	);
}

/** Terminal-style masthead. Compact, no overflow on mobile. */
export function Banner() {
	const t = useT();
	const locale = useLocale();
	return (
		<header className="mb-6 flex items-start justify-between gap-4">
			<Link
				to="/$lang"
				params={{ lang: locale }}
				className="min-w-0 no-underline hover:no-underline"
			>
				<div className="text-phosphor leading-tight text-[13px] sm:text-base">
					<div>
						{"┌─[ "}
						<span className="font-bold">how·is·my·ip</span>
						{" ]"}
					</div>
					<div className="flex min-w-0 gap-1">
						<span className="shrink-0">└─</span>
						<span className="min-w-0 text-muted">{t.tagline}</span>
					</div>
				</div>
			</Link>
			<LangToggle />
		</header>
	);
}
