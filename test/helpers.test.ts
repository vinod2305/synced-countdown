import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTimeFromDateHeader,
  fetchTimeFromJson,
} from '../src/core/helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchTimeFromDateHeader', () => {
  it('parses the HTTP Date header into epoch ms', async () => {
    const dateStr = 'Wed, 21 Oct 2015 07:28:00 GMT';
    const expected = Date.parse(dateStr);
    const fetchMock = vi.fn().mockResolvedValue({
      headers: new Headers({ date: dateStr }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const fn = fetchTimeFromDateHeader('/api/time');
    expect(await fn()).toBe(expected);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/time',
      expect.objectContaining({ method: 'HEAD' }),
    );
  });

  it('throws when the Date header is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ headers: new Headers() }),
    );
    const fn = fetchTimeFromDateHeader('/api/time');
    await expect(fn()).rejects.toThrow(/no "Date" response header/);
  });

  it('throws when the Date header is unparseable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ headers: new Headers({ date: 'not-a-date' }) }),
    );
    const fn = fetchTimeFromDateHeader('/api/time');
    await expect(fn()).rejects.toThrow(/unparseable Date header/);
  });

  it('merges custom requestInit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      headers: new Headers({ date: 'Wed, 21 Oct 2015 07:28:00 GMT' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const fn = fetchTimeFromDateHeader('/api/time', {
      method: 'GET',
      headers: { 'x-test': '1' },
    });
    await fn();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/time',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('fetchTimeFromJson', () => {
  it('reads the default "serverTime" property', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ serverTime: 1700000000000 }) }),
    );
    const fn = fetchTimeFromJson('/api/time');
    expect(await fn()).toBe(1700000000000);
  });

  it('reads a custom property via pick', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ epoch: 42 }) }),
    );
    const fn = fetchTimeFromJson('/api/time', 'epoch');
    expect(await fn()).toBe(42);
  });

  it('throws when the property is not a number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ serverTime: 'nope' }) }),
    );
    const fn = fetchTimeFromJson('/api/time');
    await expect(fn()).rejects.toThrow(/not a number/);
  });
});
