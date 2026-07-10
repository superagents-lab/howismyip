import { Link, useParams } from "@tanstack/react-router";
import { locales } from "../i18n/messages";
import { useLocale, useT } from "../i18n/use-t";

const LABELS: Record<string, string> = { en: "EN", zh: "中" };
const GITHUB_URL = "https://github.com/superagents-lab/howismyip";

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
				className="brand-link flex min-w-0 items-center gap-2 no-underline"
			>
				<img
					src="/icon.svg"
					alt=""
					width={32}
					height={32}
					aria-hidden="true"
					className="size-8 shrink-0"
				/>
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
			<div className="flex shrink-0 items-center gap-3 text-xs">
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noreferrer"
					className="text-muted no-underline hover:text-phosphor"
				>
					GitHub ↗
				</a>
				<LangToggle />
			</div>
		</header>
	);
}
