import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest picks this file up INSTEAD of vite.config.ts. That separation is
// deliberate: the app's real Vite config loads the Cloudflare plugin, which
// rejects Vitest's test-runner defaults (`resolve.external` on the worker
// environment) at startup. Tests run in plain Node — no workerd — so modules
// that touch Cloudflare bindings must fail open without them (they do; see
// src/server/provider-quota.ts).
export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [viteReact()],
});
