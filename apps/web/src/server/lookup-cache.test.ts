import { describe, expect, it } from "vitest";
import { cacheTtlSecondsForStatuses } from "./lookup-cache";

describe("lookup cache TTL", () => {
	it("keeps complete reports for six hours", () => {
		expect(cacheTtlSecondsForStatuses(["ok", "empty", "skipped"])).toBe(21_600);
	});

	it("retries partial reports after five minutes", () => {
		expect(cacheTtlSecondsForStatuses(["ok", "error", "ok"])).toBe(300);
	});
});
