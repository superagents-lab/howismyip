import { lookupIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";
import { detectClientIp } from "../../server/client-ip.server";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/me — looks up the caller's own (public) IP. */
export const Route = createFileRoute("/api/me")({
	server: {
		handlers: {
			GET: async () => {
				const ip = await detectClientIp();
				if (!ip) {
					return Response.json(
						{ error: "could not determine client IP" },
						{ status: 422, headers: CORS },
					);
				}
				const report = await lookupIp(ip);
				return Response.json(report, { headers: CORS });
			},
		},
	},
});
