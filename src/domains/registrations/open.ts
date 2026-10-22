/**
 * Wave 17 (F1): a form takes applications when it is open to the public, not
 * archived, and today (Brussels) falls between its optional opening and
 * closing dates. One condition, used by the public page, the widget, the
 * guest link, drafts and submissions.
 */
export const formOpenSql = (f: string) =>
  `(${f}.published AND NOT ${f}.archived AND (${f}.opens_on IS NULL OR ${f}.opens_on<=(now() AT TIME ZONE 'Europe/Brussels')::date) AND (${f}.closes_on IS NULL OR ${f}.closes_on>=(now() AT TIME ZONE 'Europe/Brussels')::date))`;
