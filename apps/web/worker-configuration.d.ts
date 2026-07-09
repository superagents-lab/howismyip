/**
 * Ambient types for the Cloudflare Workers runtime virtual module.
 *
 * `cloudflare:workers` is provided by the Workers runtime / `@cloudflare/vite-plugin`
 * at runtime and has no shipped type declarations in this project (we do not depend
 * on `@cloudflare/workers-types`). We declare only the surface we use: `env`, the
 * native Rate Limiting binding (`API_RATE_LIMITER`), and the Durable Object surface
 * behind the provider-quota counter (`PROVIDER_QUOTA`) — both configured in
 * `wrangler.jsonc`.
 */
declare module "cloudflare:workers" {
	interface RateLimit {
		limit(options: { key: string }): Promise<{ success: boolean }>;
	}

	interface DurableObjectStorage {
		get<T = unknown>(key: string): Promise<T | undefined>;
		get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
		put(key: string, value: unknown): Promise<void>;
		put(entries: Record<string, unknown>): Promise<void>;
		deleteAll(): Promise<void>;
	}

	interface DurableObjectState {
		storage: DurableObjectStorage;
	}

	interface DurableObjectId {
		toString(): string;
	}

	interface DurableObjectStub {
		fetch(input: Request | string, init?: RequestInit): Promise<Response>;
	}

	interface DurableObjectNamespace {
		idFromName(name: string): DurableObjectId;
		get(id: DurableObjectId): DurableObjectStub;
	}

	interface CloudflareEnv {
		API_RATE_LIMITER?: RateLimit;
		PROVIDER_QUOTA?: DurableObjectNamespace;
	}

	export const env: CloudflareEnv;
}
