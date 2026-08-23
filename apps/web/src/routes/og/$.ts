import { CustomFont, ImageResponse } from "@cf-wasm/og";
import { InvalidIpError, isValidIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";
import { cachedLookup } from "../../server/lookup-cache";
import { ogImageElement } from "../../og/render";
import jetbrainsBold from "../../og/fonts/JetBrainsMono-Bold.ttf?arraybuffer&base64";
import jetbrainsRegular from "../../og/fonts/JetBrainsMono-Regular.ttf?arraybuffer&base64";

/**
 * GET /og/<ip>.png — server-rendered Open Graph preview for an IP report page.
 *
 * Renders a 1200x630 PNG with the actual lookup data for that IP (verdict,
 * location, ASN, ISP, risk score) using satori + resvg. Uses the same
 * `cachedLookup` pipeline as the JSON API, so OG image generation shares the
 * edge cache and provider quota rather than burning a separate fan-out.
 *
 * Only real IP addresses render (anything else 404s): the URL carries no
 * free-form text, so there is no injection surface, and the image is cached
 * at the edge for 1 day.
 */
export const Route = createFileRoute("/og/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const raw = params._splat ?? "";
				const ip = raw.replace(/\.png$/i, "").toLowerCase();
				if (!isValidIp(ip)) {
					return new Response("Not found", { status: 404 });
				}
				try {
					const { report } = await cachedLookup(ip, "og_image");
					const response = await ImageResponse.async(
						ogImageElement(report, report?.ip ?? ip),
						{
							width: 1200,
							height: 630,
							fonts: [
								new CustomFont("JetBrains Mono", jetbrainsRegular, {
									weight: 400,
								}),
								new CustomFont("JetBrains Mono", jetbrainsBold, {
									weight: 700,
								}),
							],
						},
					);
					const headers = new Headers(response.headers);
					headers.set("cache-control", "public, max-age=86400");
					headers.set("content-type", "image/png");
					return new Response(response.body, { headers });
				} catch (err) {
					if (err instanceof InvalidIpError) {
						return new Response("Not found", { status: 404 });
					}
					console.error("og image render failed:", err);
					return new Response("Internal Server Error", { status: 500 });
				}
			},
		},
	},
});
