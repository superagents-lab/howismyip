import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLocale, useT } from "../i18n/use-t";
import { lookupSelfFn } from "../server/lookup";

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
		if (ip && !searching) {
			go(ip);
		}
	}

	async function scanSelf() {
		setScanning(true);
		setNote(null);
		try {
			const self = await lookupSelfFn();
			if (self.ip && self.reason === null) {
				await go(self.ip);
				return;
			}
			setNote(
				self.reason === "private" && self.ip
					? t.search.notePrivate(self.ip)
					: t.search.noteUndetectable,
			);
		} finally {
			setScanning(false);
		}
	}

	return (
		<div className="space-y-2">
			<form onSubmit={submit} className="flex flex-wrap items-stretch gap-2">
				<div
					className={`flex min-w-[260px] flex-1 items-center gap-2 border bg-panel px-3 py-2 focus-within:border-phosphor-dim ${
						searching ? "border-phosphor-dim" : "border-border"
					}`}
				>
					<span className="select-none text-phosphor">{t.search.prefix}</span>
					<input
						// biome-ignore lint/a11y/noAutofocus: terminal prompt UX
						autoFocus
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder={t.search.placeholder}
						spellCheck={false}
						autoCapitalize="off"
						autoCorrect="off"
						disabled={searching}
						className="flex-1 bg-transparent text-fg outline-none placeholder:text-muted"
					/>
					{searching && <span className="cursor text-phosphor" />}
				</div>
				<button
					type="submit"
					disabled={searching || !value.trim()}
					className="border border-phosphor-dim bg-panel px-4 py-2 text-phosphor hover:bg-phosphor hover:text-bg disabled:opacity-50"
				>
					{searching ? t.search.searching : t.search.run}
				</button>
				<button
					type="button"
					onClick={scanSelf}
					disabled={scanning || searching}
					className="border border-border bg-panel px-4 py-2 text-muted hover:border-phosphor-dim hover:text-fg disabled:opacity-50"
				>
					{scanning ? t.search.scanning : t.search.scan}
				</button>
			</form>
			{note && <p className="text-amber text-xs">{note}</p>}
		</div>
	);
}
