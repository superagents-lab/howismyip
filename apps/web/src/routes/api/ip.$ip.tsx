import { InvalidIpError } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";
import { cachedLookup } from "../../server/lookup-cache";
import { rateLimitGuard } from "../../server/rate-limit.server";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/ip/:ip — the endpoint the CLI and agents call. */
export const Route = createFileRoute("/api/ip/$ip")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const limited = await rateLimitGuard();
				if (limited) {
					return limited;
				}
				try {
					const { report, cache } = await cachedLookup(params.ip, "api_ip");
					return Response.json(report, {
						headers: { ...CORS, "x-cache": cache },
					});
				} catch (err) {
					if (err instanceof InvalidIpError) {
						return Response.json(
							{ error: err.message },
							{ status: 400, headers: CORS },
						);
					}
					return Response.json(
						{ error: err instanceof Error ? err.message : "lookup failed" },
						{ status: 500, headers: CORS },
					);
				}
			},
		},
	},
});
