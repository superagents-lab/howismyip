import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isLocale } from "../../i18n/messages";

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

/** Locale layout. Validates `$lang`; bare-IP paths (/8.8.8.8) are forwarded to
 *  the default locale's detail page so old-style links still resolve. */
export const Route = createFileRoute("/$lang")({
	beforeLoad: ({ params }) => {
		if (isLocale(params.lang)) {
			return;
		}
		if (IPV4_RE.test(params.lang) || IPV6_RE.test(params.lang)) {
			throw redirect({
				to: "/$lang/$ip",
				params: { lang: "en", ip: params.lang },
			});
		}
		throw redirect({ to: "/$lang", params: { lang: "en" } });
	},
	component: Outlet,
});
