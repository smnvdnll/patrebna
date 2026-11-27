/**
 * Kufar's SSR pages reject a raw non-ASCII query string: `?query=разбит+экран`
 * returns HTTP 400 while the percent-encoded form returns 200. Links are
 * user-supplied and stored verbatim, so any Cyrillic query silently kills the
 * whole link (and, under the parser's parallel fan-out, shows up as 429 noise).
 *
 * Normalise before every upstream request: percent-encode the `query` param,
 * leave everything else byte-identical.
 */
export function normalizeKufarUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const query = url.searchParams.get('query');
    if (query === null) return rawUrl;
    // URLSearchParams re-encodes on serialisation, which is exactly the fix.
    url.searchParams.set('query', query);
    // `+` and `%20` are both accepted upstream; URLSearchParams emits `+`.
    return url.toString();
  } catch {
    // Malformed URL: hand it back untouched, the request will fail loudly.
    return rawUrl;
  }
}

export function isAsciiUrl(rawUrl: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[^\x00-\x7F]/.test(rawUrl);
}
