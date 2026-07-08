import { useEffect, useRef, useState } from 'react';
import { createServerClock, type ServerClock } from 'synced-countdown';
import {
  useServerCountdown,
  useServerTime,
  type CountdownResult,
} from 'synced-countdown/react';

/**
 * The whole point of this demo: a wrong *device* clock makes a naive countdown
 * lie, while a server-synced countdown stays correct.
 *
 * We simulate that with two clocks that both read the same (deliberately
 * skewed) device time:
 *   - `deviceClock` has NO fetchTime, so it trusts the wrong device clock.
 *   - `syncedClock` HAS a mocked fetchTime returning the *true* server time,
 *     so it computes an offset that cancels the skew out.
 *
 * Drag the skew slider to make the device clock wrong. The device countdown
 * jumps immediately. The synced countdown also jumps (its last-measured offset
 * is now stale) — until you press "Resync", at which point it snaps back to
 * correct while the device clock stays wrong.
 */

const pad = (n: number) => String(n).padStart(2, '0');

function format(c: CountdownResult): string {
  const dayPart = c.days > 0 ? `${c.days}d ` : '';
  return `${dayPart}${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}

export function App() {
  // Live skew (ms) read by BOTH clocks' now(). A ref so the clocks always see
  // the current value without being recreated.
  const skewRef = useRef(0);
  const [skew, setSkew] = useState(0);

  // Create the two clocks once (lazy ref init — no side effects in render body
  // beyond first construction).
  const clocksRef = useRef<{ synced: ServerClock; device: ServerClock } | null>(
    null,
  );
  if (!clocksRef.current) {
    // The "device" wall clock: real time plus the injected skew.
    const deviceNow = () => Date.now() + skewRef.current;
    // The mocked server endpoint: returns the TRUE current time.
    const mockFetchTime = async () => Date.now();

    clocksRef.current = {
      synced: createServerClock({
        fetchTime: mockFetchTime,
        now: deviceNow,
        samples: 3,
      }),
      device: createServerClock({ now: deviceNow }),
    };
  }
  const { synced: syncedClock, device: deviceClock } = clocksRef.current;

  // Fixed target ~2 minutes from the true server time.
  const targetRef = useRef(Date.now() + 120_000);
  const target = targetRef.current;

  const [lastResync, setLastResync] = useState<number | null>(null);

  // Sync once on mount; dispose on unmount.
  useEffect(() => {
    void syncedClock.sync().then(() => setLastResync(Date.now()));
    return () => {
      syncedClock.dispose();
      deviceClock.dispose();
    };
  }, [syncedClock, deviceClock]);

  const syncedCountdown = useServerCountdown(target, { clock: syncedClock });
  const deviceCountdown = useServerCountdown(target, { clock: deviceClock });
  const { offset, status } = useServerTime(syncedClock);

  function applySkew(v: number) {
    skewRef.current = v;
    setSkew(v);
  }

  async function resync() {
    await syncedClock.sync();
    setLastResync(Date.now());
  }

  // How far apart the two countdowns are right now (the visible drift).
  const driftMs = deviceCountdown.remaining - syncedCountdown.remaining;
  const driftSeconds = Math.round(driftMs / 1000);

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header>
          <h1 style={styles.h1}>synced-countdown</h1>
          <p style={styles.subtitle}>
            A wrong device clock makes a naive countdown lie. A server-synced
            one stays correct. Drag the skew, watch them diverge, then hit{' '}
            <strong>Resync</strong>.
          </p>
        </header>

        <section style={styles.cards}>
          <ClockCard
            label="Device clock"
            sublabel="trusts Date.now() — no server sync"
            countdown={deviceCountdown}
            accent="#ef4444"
            wrong={Math.abs(driftSeconds) >= 1}
          />
          <ClockCard
            label="Synced clock"
            sublabel="NTP-style offset from the server"
            countdown={syncedCountdown}
            accent="#22c55e"
            wrong={false}
          />
        </section>

        <p
          style={{
            ...styles.drift,
            color: Math.abs(driftSeconds) >= 1 ? '#ef4444' : '#94a3b8',
          }}
        >
          {Math.abs(driftSeconds) < 1
            ? 'The two clocks agree.'
            : `The device countdown is ${driftSeconds > 0 ? 'ahead by' : 'behind by'} ${Math.abs(
                driftSeconds,
              )}s — it is lying to the user.`}
        </p>

        <section style={styles.controls}>
          <label style={styles.controlLabel}>
            Injected device-clock skew:{' '}
            <strong>
              {skew >= 0 ? '+' : ''}
              {(skew / 1000).toFixed(0)}s
            </strong>
          </label>
          <input
            type="range"
            min={-60000}
            max={60000}
            step={1000}
            value={skew}
            onChange={(e) => applySkew(Number(e.target.value))}
            style={styles.slider}
          />
          <div style={styles.buttonRow}>
            <button style={styles.ghostButton} onClick={() => applySkew(0)}>
              Reset skew
            </button>
            <button style={styles.primaryButton} onClick={() => void resync()}>
              Resync
            </button>
          </div>
        </section>

        <section style={styles.stats}>
          <Stat label="clock status" value={status} />
          <Stat
            label="measured offset"
            value={`${offset >= 0 ? '+' : ''}${offset} ms`}
          />
          <Stat
            label="last resync"
            value={
              lastResync
                ? `${Math.max(0, Math.round((Date.now() - lastResync) / 1000))}s ago`
                : '—'
            }
          />
        </section>

        <p style={styles.footnote}>
          Both countdowns target the same instant (~2 minutes out). The device
          clock reads <code>Date.now() + skew</code>; the mocked server always
          returns the true time. Refresh the page to restart the countdown.
        </p>
      </div>
    </main>
  );
}

function ClockCard(props: {
  label: string;
  sublabel: string;
  countdown: CountdownResult;
  accent: string;
  wrong: boolean;
}) {
  const { label, sublabel, countdown, accent, wrong } = props;
  return (
    <div
      style={{
        ...styles.card,
        borderColor: wrong ? '#ef4444' : 'rgba(148,163,184,0.25)',
      }}
    >
      <div style={{ ...styles.cardDot, background: accent }} />
      <div style={styles.cardLabel}>{label}</div>
      <div style={styles.cardSublabel}>{sublabel}</div>
      <div style={{ ...styles.time, color: accent }}>
        {countdown.isComplete ? '00:00:00' : format(countdown)}
      </div>
      <div style={styles.breakdown}>
        {countdown.days}d · {countdown.hours}h · {countdown.minutes}m ·{' '}
        {countdown.seconds}s
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{props.label}</div>
      <div style={styles.statValue}>{props.value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    background: 'radial-gradient(1200px 600px at 50% -10%, #1e293b, #0f172a)',
    color: '#e2e8f0',
    fontFamily:
      "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  container: { width: '100%', maxWidth: 720 },
  h1: { margin: '0 0 0.25rem', fontSize: '1.9rem', letterSpacing: '-0.02em' },
  subtitle: { margin: '0 0 1.5rem', color: '#94a3b8', lineHeight: 1.5 },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '1rem',
  },
  card: {
    position: 'relative',
    padding: '1.25rem 1.25rem 1rem',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.6)',
    transition: 'border-color 160ms ease',
  },
  cardDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  cardLabel: { fontWeight: 600, fontSize: '0.95rem' },
  cardSublabel: { color: '#94a3b8', fontSize: '0.8rem', marginTop: 2 },
  time: {
    fontSize: '2.4rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    margin: '0.75rem 0 0.25rem',
    letterSpacing: '0.01em',
  },
  breakdown: { color: '#64748b', fontSize: '0.8rem' },
  drift: {
    textAlign: 'center',
    fontSize: '0.9rem',
    minHeight: '1.25rem',
    margin: '1rem 0',
    fontWeight: 500,
  },
  controls: {
    padding: '1.25rem',
    borderRadius: 14,
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(148,163,184,0.25)',
  },
  controlLabel: { display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem' },
  slider: { width: '100%', accentColor: '#38bdf8' },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1rem',
    justifyContent: 'flex-end',
  },
  ghostButton: {
    padding: '0.55rem 1rem',
    borderRadius: 9,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'transparent',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  primaryButton: {
    padding: '0.55rem 1.25rem',
    borderRadius: 9,
    border: 'none',
    background: '#38bdf8',
    color: '#0f172a',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  stat: {
    padding: '0.75rem',
    borderRadius: 10,
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(148,163,184,0.2)',
    textAlign: 'center',
  },
  statLabel: {
    color: '#64748b',
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statValue: {
    fontWeight: 600,
    marginTop: 4,
    fontVariantNumeric: 'tabular-nums',
  },
  footnote: {
    color: '#64748b',
    fontSize: '0.78rem',
    lineHeight: 1.5,
    marginTop: '1.5rem',
    textAlign: 'center',
  },
};
