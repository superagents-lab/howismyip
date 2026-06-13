import { useParams } from "@tanstack/react-router";
import {
	type Dictionary,
	defaultLocale,
	getDictionary,
	isLocale,
	type Locale,
} from "./messages";

/** Current locale from the `$lang` route param, falling back to the default. */
export function useLocale(): Locale {
	const params = useParams({ strict: false }) as { lang?: string };
	return isLocale(params.lang) ? params.lang : defaultLocale;
}

/** The active dictionary for the current locale. */
export function useT(): Dictionary {
	return getDictionary(useLocale());
}
