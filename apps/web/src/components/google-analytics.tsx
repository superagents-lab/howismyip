import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { initializeGoogleAnalytics, trackPageView } from "../lib/analytics";

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;

/** Loads GA only in production, then tracks TanStack Router navigations. */
export function GoogleAnalytics() {
	const routeHref = useRouterState({
		select: (state) => state.location.href,
	});

	useEffect(() => {
		if (!import.meta.env.PROD) return;
		if (!initializeGoogleAnalytics(measurementId)) return;
		trackPageView(routeHref);
	}, [routeHref]);

	return null;
}
