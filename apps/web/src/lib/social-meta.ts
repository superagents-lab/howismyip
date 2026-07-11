import type { Locale } from "../i18n/messages";

export const SITE_ORIGIN = "https://howismyip.xyz";
export const OG_IMAGE_URL = `${SITE_ORIGIN}/og-image.png`;

export function buildSocialMeta({
	title,
	description,
	url,
	imageAlt,
	locale,
}: {
	title: string;
	description: string;
	url: string;
	imageAlt: string;
	locale: Locale;
}) {
	return [
		{ title },
		{ name: "description", content: description },
		{ property: "og:type", content: "website" },
		{ property: "og:site_name", content: "howismyip" },
		{ property: "og:locale", content: locale === "zh" ? "zh_CN" : "en_US" },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:url", content: url },
		{ property: "og:image", content: OG_IMAGE_URL },
		{ property: "og:image:secure_url", content: OG_IMAGE_URL },
		{ property: "og:image:type", content: "image/png" },
		{ property: "og:image:width", content: "1200" },
		{ property: "og:image:height", content: "630" },
		{ property: "og:image:alt", content: imageAlt },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
		{ name: "twitter:image", content: OG_IMAGE_URL },
		{ name: "twitter:image:alt", content: imageAlt },
	];
}
