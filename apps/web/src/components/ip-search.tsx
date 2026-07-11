import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLocale, useT } from "../i18n/use-t";
import { lookupSelfFn } from "../server/lookup";

export function QueryLoader({
	label,
	detail,
}: {
	label: string;
	detail: string;
}) {
	return (
		<div className="query-loader border border-phosphor-dim bg-panel-2 px-3 py-2 text-xs">
			<div className="mb-1 flex items-center justify-between gap-3">
				<span className="font-bold text-phosphor">{label}</span>
				<span className="text-muted">{detail}</span>
			</div>
			<div className="query-loader-track">
				<div className="query-loader-bar" />
			</div>
		</div>
	);
}

/** Prompt-style IP input. Submitting navigates to /:lang/:ip; the scan button
 *  resolves the caller's own public IP server-side then routes to it. */
export function IpSearch({ initial = "" }: { initial?: string }) {
	const navigate = useNavigate();
	const t = useT();
	const lang = useLocale();
	const [value, setValue] = useState(initial);
	const [searching, setSearching] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	const busy = searching || scanning;
	const busyLabel = scanning ? t.search.scanning : t.search.searching;

	async function go(ip: string) {
		setSearching(true);
		try {
			await navigate({ to: "/$lang/$ip", params: { lang, ip } });
		} finally {
			setSearching(false);
		}
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		const ip = value.trim();
		if (ip && !busy) {
			go(ip);
		}
	}

	async function scanSelf() {
		if (busy) {
			return;
		}
		setScanning(true);
		setNote(null);
		try {
			const self = await lookupSelfFn();
			if (self.ip && self.reason === null) {
				await go(self.ip);
				return;
			}
			setNote(
				self.reason === "rateLimited"
					? t.error.rateLimited
					: self.reason === "private" && self.ip
						? t.search.notePrivate(self.ip)
						: t.search.noteUndetectable,
			);
		} finally {
			setScanning(false);
		}
	}

	return (
		<div className="space-y-2">
			<form
				onSubmit={submit}
				className={`grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch ${busy ? "query-busy" : ""}`}
			>
				<div
					className={`col-span-2 flex min-h-11 w-full items-center gap-2 border bg-panel px-3 py-2 focus-within:border-phosphor-dim sm:min-h-0 sm:min-w-[260px] sm:flex-1 ${
						busy
							? "border-phosphor-dim shadow-[0_0_0_1px_var(--color-phosphor-dim)]"
							: "border-border"
					}`}
				>
					<span className="select-none text-phosphor">{t.search.prefix}</span>
					<input
						// biome-ignore lint/a11y/noAutofocus: terminal prompt UX
						autoFocus
						value={value}
						onChange={(e) => setValue(e.target.value)}
						aria-label={t.search.inputLabel}
						placeholder={t.search.placeholder}
						spellCheck={false}
						autoCapitalize="off"
						autoCorrect="off"
						disabled={busy}
						className="flex-1 bg-transparent text-fg outline-none placeholder:text-muted"
					/>
					{busy && <span className="cursor text-phosphor" />}
				</div>
				<button
					type="submit"
					disabled={busy || !value.trim()}
					className="min-h-11 w-full whitespace-nowrap border border-phosphor-dim bg-panel px-3 py-2 text-phosphor hover:bg-phosphor hover:text-bg disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:opacity-60 disabled:hover:bg-panel disabled:hover:text-muted sm:min-h-0 sm:w-auto sm:px-4"
				>
					{searching ? t.search.searching : t.search.run}
				</button>
				<button
					type="button"
					onClick={scanSelf}
					disabled={busy}
					className="min-h-11 w-full whitespace-nowrap border border-border bg-panel px-3 py-2 text-muted hover:border-phosphor-dim hover:text-fg disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto sm:px-4"
				>
					{scanning ? t.search.scanning : t.search.scan}
				</button>
			</form>
			{busy && (
				<QueryLoader label={busyLabel} detail={t.search.loadingDetail} />
			)}
			{note && <p className="text-amber text-xs">{note}</p>}
		</div>
	);
}
