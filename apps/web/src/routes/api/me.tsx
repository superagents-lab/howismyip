import { isPrivateOrReserved, isValidIp, lookupIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";
import { detectClientIp } from "../../server/client-ip.server";
import { fetchEgressIp } from "../../server/lookup";
import { rateLimitGuard } from "../../server/rate-limit.server";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/me — looks up the caller's own (public) IP. */
export const Route = createFileRoute("/api/me")({
	server: {
		handlers: {
			GET: async () => {
				const limited = await rateLimitGuard();
				if (limited) {
					return limited;
				}
				const headerIp = await detectClientIp();
				let ip =
					headerIp && isValidIp(headerIp) && !isPrivateOrReserved(headerIp)
						? headerIp
						: null;
				if (!ip) {
					ip = await fetchEgressIp();
				}
				if (!ip) {
					return Response.json(
						{ error: "could not determine a public client IP" },
						{ status: 422, headers: CORS },
					);
				}
				try {
					const report = await lookupIp(ip);
					return Response.json(report, { headers: CORS });
				} catch (err) {
					return Response.json(
						{ error: err instanceof Error ? err.message : "lookup failed" },
						{ status: 500, headers: CORS },
					);
				}
			},
		},
	},
});
