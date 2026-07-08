import type { FetchTime } from './types.js';

/**
 * Builds a {@link FetchTime} that reads the server clock from the HTTP `Date`
 * response header. Uses a `HEAD` request by default (cheap, no body). Falls
 * back gracefully — throws if the header is missing so the clock records an
 * error rather than a bad offset.
 */
export function fetchTimeFromDateHeader(
  url: string,
  requestInit?: RequestInit,
): FetchTime {
  return async () => {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store', ...requestInit });
    const dateHeader = res.headers.get('date');
    if (!dateHeader) {
      throw new Error('fetchTimeFromDateHeader: no "Date" response header present');
    }
    const ms = Date.parse(dateHeader);
    if (Number.isNaN(ms)) {
      throw new Error(`fetchTimeFromDateHeader: unparseable Date header "${dateHeader}"`);
    }
    return ms;
  };
}

/**
 * Builds a {@link FetchTime} that reads the server clock from a JSON endpoint.
 * By default it expects `{ "serverTime": <epoch ms> }`; pass `pick` to read a
 * different property.
 */
export function fetchTimeFromJson(url: string, pick = 'serverTime'): FetchTime {
  return async () => {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as Record<string, unknown>;
    const value = Number(json[pick]);
    if (Number.isNaN(value)) {
      throw new Error(`fetchTimeFromJson: property "${pick}" is not a number`);
    }
    return value;
  };
}
