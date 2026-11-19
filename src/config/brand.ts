/**
 * Single-file brand & campus configuration for Divly.
 *
 * Want to rename the platform or launch at another university?
 * Edit the constants below and the entire storefront updates automatically.
 */

export const BRAND_NAME = 'Divly';

export const BRAND_TAGLINE =
  'Bulk prices with other UoB students — lower than UK supermarket prices.';

export const CAMPUS_NAME = 'University of Birmingham';

export const CAMPUS_SHORT_NAME = 'UoB';

export const ALLOWED_EMAIL_DOMAINS = [
  '@student.bham.ac.uk',
  '@bham.ac.uk',
] as const;

/** Check whether an email matches one of the allowed university domains. */
export function isAllowedCampusEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(domain));
}
