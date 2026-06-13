/**
 * Caller-IP detection. The `@tanstack/react-start/server` request helpers are
 * imported dynamically so this module stays out of the client bundle even if a
 * client-reachable file references it — only server code ever awaits it.
 */
export async function detectClientIp(): Promise<string | null> {
	const { getRequestHeaders, getRequestIP } = await import(
		"@tanstack/react-start/server"
	);
	const headers = getRequestHeaders() as unknown as Record<
		string,
		string | undefined
	>;
	const candidates = [
		headers["cf-connecting-ip"],
		headers["x-real-ip"],
		headers["x-forwarded-for"]?.split(",")[0],
		getRequestIP(),
	];
	for (const candidate of candidates) {
		const ip = candidate?.trim();
		if (ip) {
			return ip;
		}
	}
	return null;
}
