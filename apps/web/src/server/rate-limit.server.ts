/**
 * Per-client rate limit shared by every lookup entry point: the public JSON
 * API routes AND the server functions the web UI calls (which TanStack Start
 * exposes as public `/_serverFn/` endpoints — they must not be a bypass).
 *
 * The Cloudflare native Rate Limiting binding (`API_RATE_LIMITER`, configured in
 * `wrangler.jsonc`) is reached through the runtime-provided `cloudflare:workers`
 * virtual module's `env`. That module only exists inside the Workers runtime, so
 * the import is dynamic and every failure path FAILS OPEN (= allow): under
 * plain Node dev or any limiter error the app must keep working.
 *
 * The guard runs BEFORE the edge cache (plan 003) by design, so cached hits
 * still count toward the limit.
 */
import { detectClientIp } from "./client-ip.server";

const CORS = { "access-control-allow-origin": "*" } as const;

/** True when the calling client exceeded its limit. Fails open on any error
 *  or when the binding is unavailable (e.g. local Node dev). */
export async function isRateLimited(): Promise<boolean> {
	try {
		const { env } = await import("cloudflare:workers");
		const limiter = env?.API_RATE_LIMITER;
		if (!limiter) {
			return false; // fail open when no binding (e.g. plain Node dev)
		}
		const key = (await detectClientIp()) ?? "anon";
		const { success } = await limiter.limit({ key });
		return !success;
	} catch {
		return false; // fail open on any limiter error
	}
}

/** Returns `null` when the request is allowed, or a ready-to-send `429`
 *  Response when the per-client limit is exceeded. For the JSON API routes;
 *  server functions use `isRateLimited` and return a typed error instead. */
export async function rateLimitGuard(): Promise<Response | null> {
	if (await isRateLimited()) {
		return Response.json(
			{ error: "rate limited" },
			{ status: 429, headers: CORS },
		);
	}
	return null;
}
