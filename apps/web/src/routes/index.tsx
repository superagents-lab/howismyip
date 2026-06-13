import { createFileRoute } from "@tanstack/react-router";

/** Root: a server-route redirect to the visitor's preferred locale. Using a
 *  server handler (not a server function) gives us the real request headers. */
export const Route = createFileRoute("/")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const accept = (
					request.headers.get("accept-language") ?? ""
				).toLowerCase();
				const lang = accept.includes("zh") ? "zh" : "en";
				return new Response(null, {
					status: 307,
					headers: { location: `/${lang}` },
				});
			},
		},
	},
});
