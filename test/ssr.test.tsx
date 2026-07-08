import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerClock } from '../src/core/clock.js';
import { createTicker } from '../src/core/ticker.js';
import { getRaf, hasDocument, hasWindow } from '../src/core/env.js';
import { useServerCountdown } from '../src/react/useServerCountdown.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SSR / non-DOM safety', () => {
  it('creates and uses a server clock without a window/document', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('performance', undefined);
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);

    expect(hasWindow()).toBe(false);
    expect(hasDocument()).toBe(false);
    expect(getRaf()).toBeNull();

    // Must not throw when constructing or syncing.
    const clock = createServerClock({
      fetchTime: async () => 1000,
      samples: 1,
      now: () => 500,
    });
    await clock.sync();
    expect(clock.getOffset()).toBe(500);
    expect(clock.now()).toBe(1000);
    clock.dispose();
  });

  it('ticker falls back to setInterval when rAF is unavailable', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);

    const onTick = vi.fn();
    const ticker = createTicker({ onTick, intervalMs: 1000 });
    ticker.start();
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    ticker.stop();
    vi.useRealTimers();
  });

  it('renders a hook-using component to static markup on the "server"', () => {
    // Effects do not run during server rendering, so no window/rAF is touched.
    function Cmp() {
      const { seconds, status } = useServerCountdown(5000);
      return (
        <span data-status={status}>{seconds}</span>
      );
    }
    const html = renderToStaticMarkup(<Cmp />);
    expect(html).toContain('span');
    expect(html).not.toBe('');
  });
});
