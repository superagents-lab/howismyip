/**
 * Ambient types for the Cloudflare Workers runtime virtual module.
 *
 * `cloudflare:workers` is provided by the Workers runtime / `@cloudflare/vite-plugin`
 * at runtime and has no shipped type declarations in this project (we do not depend
 * on `@cloudflare/workers-types`). We declare only the surface we use: `env` and the
 * native Rate Limiting binding (`API_RATE_LIMITER`, configured in `wrangler.jsonc`).
 */
declare module "cloudflare:workers" {
	interface RateLimit {
		limit(options: { key: string }): Promise<{ success: boolean }>;
	}

	interface CloudflareEnv {
		API_RATE_LIMITER?: RateLimit;
	}

	export const env: CloudflareEnv;
}
