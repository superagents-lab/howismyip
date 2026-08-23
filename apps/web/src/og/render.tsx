import type { IpReport } from "@howismyip/core";
import type { ReactNode } from "react";
import { buildVerdict } from "./verdict";

const WIDTH = 1200;
const HEIGHT = 630;

const COLOR = {
	bg: "#07090a",
	panel: "#0d1113",
	panel2: "#11161a",
	border: "#1d262b",
	fg: "#c8d3cf",
	muted: "#72847e",
	phosphor: "#36f9a0",
	phosphorDim: "#1f8f5e",
	amber: "#ffb454",
	danger: "#ff5d62",
	cyan: "#56c8d8",
} as const;

/** Builds the JSX element tree for the OG image, given the IP report. */
export function ogImageElement(report: IpReport | null, ip: string): ReactNode {
	const verdict = buildVerdict(report);
	const c = report?.consensus;
	const country = c?.country_name ?? null;
	const city = c?.city ?? null;
	const isp = c?.isp ?? null;
	const asn = c?.asn ?? null;
	const verdictColor =
		verdict.tone === "bad"
			? COLOR.danger
			: verdict.tone === "warn"
				? COLOR.amber
				: COLOR.phosphor;
	const scoreBar =
		verdict.score === null ? null : Math.max(0, Math.min(100, verdict.score));

	// Top 3 non-empty facts (source-weighted) to show under the hero.
	const factRows = [
		{ label: "country", value: country },
		{ label: "city", value: city },
		{ label: "asn", value: asn },
		{ label: "isp", value: isp },
	].filter((row): row is { label: string; value: string } => Boolean(row.value));

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: WIDTH,
				height: HEIGHT,
				backgroundColor: COLOR.bg,
				color: COLOR.fg,
				fontFamily: "JetBrains Mono",
				padding: "40px 64px",
			}}
		>
			{/* Header bar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 32,
				}}
			>
				<span style={{ color: COLOR.phosphor, fontSize: 30, fontWeight: 700 }}>
					[ how·is·my·ip ]
				</span>
				<span style={{ color: COLOR.phosphor, fontSize: 22, opacity: 0.7 }}>
					howismyip.xyz
				</span>
			</div>

			{/* IP + verdict hero */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					padding: "24px 28px",
					border: `2px solid ${COLOR.border}`,
					backgroundColor: COLOR.panel,
					marginBottom: 24,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						width: "100%",
					}}
				>
					<span style={{ fontSize: 52, fontWeight: 700, color: COLOR.fg }}>
						{ip}
					</span>
					<span
						style={{
							fontSize: 26,
							fontWeight: 700,
							textTransform: "uppercase",
							color: verdictColor,
							marginLeft: 24,
						}}
					>
						{verdict.text}
					</span>
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						marginTop: 14,
						gap: 20,
					}}
				>
					{factRows.slice(0, 3).map((row) => (
						<span
							key={row.label}
							style={{ display: "flex", alignItems: "center", gap: 8 }}
						>
							<span
								style={{
									fontSize: 15,
									color: COLOR.muted,
									textTransform: "uppercase",
								}}
							>
								{row.label}
							</span>
							<span
								style={{
									fontSize: 15,
									color: row.label === "asn" ? COLOR.cyan : COLOR.fg,
								}}
							>
								{row.value}
							</span>
						</span>
					))}
				</div>
			</div>

			{/* Risk score meter */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					marginBottom: 24,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<span
						style={{
							fontSize: 16,
							color: COLOR.muted,
							textTransform: "uppercase",
						}}
					>
						risk score
					</span>
					<span style={{ fontSize: 28, fontWeight: 700, color: verdictColor }}>
						{verdict.score === null ? "—" : String(Math.round(verdict.score))}
					</span>
				</div>
				<div
					style={{
						display: "flex",
						height: 8,
						width: "100%",
						backgroundColor: COLOR.border,
					}}
				>
					{scoreBar !== null && (
						<div
							style={{
								height: 8,
								width: `${scoreBar}%`,
								backgroundColor: verdictColor,
							}}
						/>
					)}
				</div>
			</div>

			{/* Signal chips (≥2-source agreement) */}
			{verdict.signals.length > 0 && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						marginBottom: 24,
					}}
				>
					<span
						style={{
							fontSize: 15,
							color: COLOR.muted,
							textTransform: "uppercase",
						}}
					>
						signals
					</span>
					{verdict.signals.map((signal) => (
						<span
							key={signal}
							style={{
								fontSize: 14,
								color: COLOR.danger,
								border: `1px solid ${COLOR.danger}`,
								padding: "4px 10px",
								textTransform: "uppercase",
							}}
						>
							{signal}
						</span>
					))}
				</div>
			)}

			{/* Footer */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginTop: "auto",
				}}
			>
				<span style={{ fontSize: 16, color: COLOR.muted }}>
					multi-source IP intelligence — howismyip.xyz
				</span>
				<span style={{ fontSize: 16, color: COLOR.phosphorDim }}>
					▲ {verdict.sources} {verdict.sources === 1 ? "source" : "sources"}
				</span>
			</div>
		</div>
	);
}
