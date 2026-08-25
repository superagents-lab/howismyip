import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
	initializeGoogleAnalytics,
	initializeUmami,
	trackPageView,
} from "../lib/analytics";

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;

/** Loads GA + Umami only in production, then tracks TanStack Router navigations. */
export function GoogleAnalytics() {
	const routeHref = useRouterState({
		select: (state) => state.location.href,
	});

	useEffect(() => {
		if (!import.meta.env.PROD) return;
		initializeGoogleAnalytics(measurementId);
		initializeUmami();
		trackPageView(routeHref);
	}, [routeHref]);

	return null;
}
