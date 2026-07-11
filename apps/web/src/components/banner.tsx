import { Link, useParams } from "@tanstack/react-router";
import { Github, Languages, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { locales } from "../i18n/messages";
import { useLocale, useT } from "../i18n/use-t";

const LANG_NAMES: Record<string, string> = { en: "English", zh: "中文" };
const GITHUB_URL = "https://github.com/superagents-lab/howismyip";
const THEME_KEY = "howismyip-theme";

type ThemePref = "light" | "dark" | "system";
const THEME_PREFS: readonly ThemePref[] = ["light", "dark", "system"];

/** Shared square icon-button chrome for the header controls. */
const iconBtn =
	"flex size-9 shrink-0 items-center justify-center border border-border bg-panel text-fg hover:border-phosphor-dim hover:text-phosphor";
const menuPanel =
	"absolute top-full right-0 z-50 mt-1 min-w-32 border border-border bg-panel py-1 shadow-lg";
const menuItem =
	"flex w-full items-center gap-2 px-3 py-1.5 text-xs no-underline hover:bg-panel-2";

/** Open/close state for a small dropdown: closes on outside click or Escape. */
function useDismissableMenu() {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onPointerDown(e: PointerEvent) {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		}
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return { open, setOpen, rootRef };
}

/** Language picker: one icon button, click opens a menu of locales.
    Links preserve the current page (home vs IP detail). */
function LangMenu() {
	const t = useT();
	const current = useLocale();
	const params = useParams({ strict: false }) as { ip?: string };
	const { open, setOpen, rootRef } = useDismissableMenu();

	return (
		<div ref={rootRef} className="relative">
			<button
				type="button"
				aria-label={t.langToggle}
				title={t.langToggle}
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className={`${iconBtn} cursor-pointer ${
					open ? "border-phosphor-dim text-phosphor" : ""
				}`}
			>
				<Languages size={16} aria-hidden="true" />
			</button>
			{open && (
				<nav className={menuPanel}>
					{locales.map((l) => (
						<Link
							key={l}
							to={params.ip ? "/$lang/$ip" : "/$lang"}
							params={params.ip ? { lang: l, ip: params.ip } : { lang: l }}
							onClick={() => setOpen(false)}
							className={`${menuItem} ${
								l === current ? "text-phosphor" : "text-fg"
							}`}
						>
							<span aria-hidden="true">{l === current ? "●" : "○"}</span>
							{LANG_NAMES[l]}
						</Link>
					))}
				</nav>
			)}
		</div>
	);
}

function readThemePref(): ThemePref {
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored === "light" || stored === "dark") return stored;
	} catch {
		// unreadable storage — treat as "system"
	}
	return "system";
}

/** Theme picker: light / dark / system. "System" clears the stored choice and
    resumes following prefers-color-scheme. The effective theme lives on
    <html data-theme>; CSS picks the button icon, so the button renders
    identically on server and client. */
function ThemeMenu() {
	const t = useT();
	const { open, setOpen, rootRef } = useDismissableMenu();
	// Which option is checked in the menu. Only read on the client (menu opens
	// after hydration), so SSR markup never depends on localStorage.
	const [pref, setPref] = useState<ThemePref>("system");

	// While on "system", keep following live OS theme changes.
	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: light)");
		function onChange() {
			if (readThemePref() !== "system") return;
			document.documentElement.dataset.theme = mq.matches ? "light" : "dark";
		}
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	function choose(next: ThemePref) {
		try {
			if (next === "system") localStorage.removeItem(THEME_KEY);
			else localStorage.setItem(THEME_KEY, next);
		} catch {
			// private mode etc. — the choice still applies to this page view
		}
		document.documentElement.dataset.theme =
			next === "system"
				? window.matchMedia("(prefers-color-scheme: light)").matches
					? "light"
					: "dark"
				: next;
		setPref(next);
		setOpen(false);
	}

	return (
		<div ref={rootRef} className="relative">
			<button
				type="button"
				aria-label={t.themeToggle}
				title={t.themeToggle}
				aria-expanded={open}
				onClick={() => {
					setPref(readThemePref());
					setOpen((o) => !o);
				}}
				className={`${iconBtn} cursor-pointer ${
					open ? "border-phosphor-dim text-phosphor" : ""
				}`}
			>
				<Sun className="theme-icon-sun" size={16} aria-hidden="true" />
				<Moon className="theme-icon-moon" size={16} aria-hidden="true" />
			</button>
			{open && (
				<div className={menuPanel}>
					{THEME_PREFS.map((opt) => (
						<button
							key={opt}
							type="button"
							onClick={() => choose(opt)}
							className={`${menuItem} cursor-pointer ${
								pref === opt ? "text-phosphor" : "text-fg"
							}`}
						>
							<span aria-hidden="true">{pref === opt ? "●" : "○"}</span>
							{t.theme[opt]}
						</button>
					))}
				</div>
			)}
		</div>
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
					src="/icon.svg?v=20260711"
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
			<div className="flex shrink-0 items-center gap-2">
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noreferrer"
					aria-label="GitHub"
					title="GitHub"
					className={`${iconBtn} no-underline`}
				>
					<Github size={16} aria-hidden="true" />
				</a>
				<ThemeMenu />
				<LangMenu />
			</div>
		</header>
	);
}
