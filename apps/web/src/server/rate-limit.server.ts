/**
 * Per-client rate limit for the public IP-lookup API.
 *
 * The Cloudflare native Rate Limiting binding (`API_RATE_LIMITER`, configured in
 * `wrangler.jsonc`) is reached through the runtime-provided `cloudflare:workers`
 * virtual module's `env`. That module only exists inside the Workers runtime, so
 * the import is dynamic and every failure path FAILS OPEN (returns `null` =
 * allow): under plain Node dev or any limiter error the API must keep working.
 *
 * The guard runs BEFORE the edge cache (plan 003) by design, so cached hits
 * still count toward the limit.
 */
import { detectClientIp } from "./client-ip.server";

const CORS = { "access-control-allow-origin": "*" } as const;

/**
 * Returns `null` when the request is allowed, or a ready-to-send `429` Response
 * when the per-client limit is exceeded. Fails open on any error or when the
 * binding is unavailable (e.g. local Node dev).
 */
export async function rateLimitGuard(): Promise<Response | null> {
	try {
		const { env } = await import("cloudflare:workers");
		const limiter = env?.API_RATE_LIMITER;
		if (!limiter) {
			return null; // fail open when no binding (e.g. plain Node dev)
		}
		const key = (await detectClientIp()) ?? "anon";
		const { success } = await limiter.limit({ key });
		if (success) {
			return null;
		}
		return Response.json(
			{ error: "rate limited" },
			{ status: 429, headers: CORS },
		);
	} catch {
		return null; // fail open on any limiter error
	}
}
