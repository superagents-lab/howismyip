import { InvalidIpError, lookupIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/ip/:ip — the endpoint the CLI and agents call. */
export const Route = createFileRoute("/api/ip/$ip")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const report = await lookupIp(params.ip);
					return Response.json(report, { headers: CORS });
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
