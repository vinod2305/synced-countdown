import { useEffect, useRef, useState } from 'react';
import { createServerClock, type ServerClock } from 'synced-countdown';
import {
  useServerCountdown,
  useServerTime,
  type CountdownResult,
} from 'synced-countdown/react';

/**
 * Demo: a wrong *device* clock makes a naive countdown lie, while a
 * server-synced countdown stays correct.
 *
 * Two clocks read the same (deliberately skewed) device time:
 *   - `deviceClock` has NO fetchTime -> it trusts the wrong device clock.
 *   - `syncedClock` HAS a mocked fetchTime returning the TRUE server time,
 *     so its measured offset cancels the skew out.
 *
 * The offset is only accurate as of the last sync. If the device clock changes
 * afterwards, the synced clock must re-sync. "Auto-resync" mimics what a real
 * app does automatically (on tab focus, network reconnect, or an interval).
 */

const C = {
  bg: '#0b0f14',
  surface: '#121821',
  surfaceMuted: '#0e141c',
  line: '#1e2732',
  text: '#e6edf3',
  muted: '#8b98a5',
  faint: '#5b6672',
  good: '#34d399',
  bad: '#f0616d',
  action: '#38bdf8',
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
};

const pad = (n: number) => String(n).padStart(2, '0');
const format = (c: CountdownResult) =>
  `${c.days > 0 ? `${c.days}d ` : ''}${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;

export function App() {
  const skewRef = useRef(0);
  const [skew, setSkew] = useState(0);
  const [autoResync, setAutoResync] = useState(true);
  const [lastResync, setLastResync] = useState<number | null>(null);

  const clocksRef = useRef<{ synced: ServerClock; device: ServerClock } | null>(
    null,
  );
  if (!clocksRef.current) {
    const deviceNow = () => Date.now() + skewRef.current; // wrong device clock
    const mockFetchTime = async () => Date.now(); // "server" = true time
    clocksRef.current = {
      synced: createServerClock({ fetchTime: mockFetchTime, now: deviceNow, samples: 3 }),
      device: createServerClock({ now: deviceNow }),
    };
  }
  const { synced: syncedClock, device: deviceClock } = clocksRef.current;

  const targetRef = useRef(Date.now() + 120_000); // ~2 min out (true time)
  const target = targetRef.current;

  useEffect(() => {
    void syncedClock.sync().then(() => setLastResync(Date.now()));
    return () => {
      syncedClock.dispose();
      deviceClock.dispose();
    };
  }, [syncedClock, deviceClock]);

  const syncedCountdown = useServerCountdown(target, { clock: syncedClock, intervalMs: 250 });
  const deviceCountdown = useServerCountdown(target, { clock: deviceClock, intervalMs: 250 });
  const { offset, status } = useServerTime(syncedClock);

  async function resync() {
    await syncedClock.sync();
    setLastResync(Date.now());
  }

  function applySkew(v: number) {
    skewRef.current = v;
    setSkew(v);
    if (autoResync) void resync();
  }

  const driftSeconds = Math.round(
    (deviceCountdown.remaining - syncedCountdown.remaining) / 1000,
  );
  const naiveWrong = Math.abs(driftSeconds) >= 1;

  return (
    <div style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.eyebrow}>npm&nbsp;i&nbsp;synced-countdown</div>
          <h1 style={s.h1}>Is your countdown telling the truth?</h1>
          <p style={s.subtitle}>
            A countdown built on <code style={s.code}>Date.now()</code> trusts the
            visitor&rsquo;s clock — which is often wrong. Both timers below count
            down to the <em>same</em> deadline. Drag the slider to fake a wrong
            device clock and watch the naive one drift while the synced one holds.
          </p>
          <div style={s.links}>
            <a style={s.link} href="https://www.npmjs.com/package/synced-countdown">npm ↗</a>
            <a style={s.link} href="https://github.com/vinod2305/synced-countdown">GitHub ↗</a>
          </div>
        </header>

        <div style={s.cards}>
          <ClockCard
            tag="NAIVE"
            title="Date.now()"
            note="Trusts the device clock. No sync."
            countdown={deviceCountdown}
            color={C.bad}
            badge={naiveWrong ? `off by ${Math.abs(driftSeconds)}s` : 'ok for now'}
            badgeBad={naiveWrong}
            emphasize={naiveWrong}
          />
          <ClockCard
            tag="SYNCED"
            title="synced-countdown"
            note="Server-anchored, latency-corrected."
            countdown={syncedCountdown}
            color={C.good}
            badge="in sync"
            badgeBad={false}
            emphasize={false}
          />
        </div>

        <div style={{ ...s.verdict, color: naiveWrong ? C.bad : C.faint }}>
          {naiveWrong
            ? `The naive countdown is ${driftSeconds > 0 ? 'ahead' : 'behind'} by ${Math.abs(driftSeconds)}s — it's lying to the user. The synced one isn't.`
            : 'Both agree. Now skew the device clock below.'}
        </div>

        <div style={s.panel}>
          <div style={s.panelRow}>
            <span style={s.panelLabel}>Pretend the visitor&rsquo;s clock is wrong</span>
            <span style={s.skewValue}>
              {skew >= 0 ? '+' : '−'}
              {Math.abs(skew / 1000).toFixed(0)}s
            </span>
          </div>
          <input
            type="range"
            min={-60000}
            max={60000}
            step={1000}
            value={skew}
            onChange={(e) => applySkew(Number(e.target.value))}
            style={{ width: '100%' }}
            aria-label="Device clock skew in seconds"
          />

          <div style={s.controlsRow}>
            <label style={s.toggle}>
              <input
                type="checkbox"
                checked={autoResync}
                onChange={(e) => setAutoResync(e.target.checked)}
                style={{ accentColor: C.action }}
              />
              <span>
                Auto-resync
                <span style={s.toggleHint}> — what a real app does on tab focus / reconnect</span>
              </span>
            </label>
            <div style={s.btnRow}>
              <button style={s.ghostBtn} onClick={() => applySkew(0)}>Reset</button>
              <button style={s.primaryBtn} onClick={() => void resync()}>Resync now</button>
            </div>
          </div>
        </div>

        <div style={s.stats}>
          <Stat label="clock status" value={status} />
          <Stat label="measured offset" value={`${offset >= 0 ? '+' : ''}${offset} ms`} />
          <Stat
            label="last resync"
            value={lastResync ? `${Math.max(0, Math.round((Date.now() - lastResync) / 1000))}s ago` : '—'}
          />
        </div>

        <div style={s.how}>
          <div style={s.howTitle}>How it works</div>
          <ol style={s.howList}>
            <li>
              The visitor&rsquo;s device clock can be wrong. <code style={s.code}>Date.now()</code> believes it — so the naive timer is off by exactly that error.
            </li>
            <li>
              <b>synced-countdown</b> asked the server for the real time and measured the <b>offset</b> between it and the device (correcting for network latency). It recomputes remaining time from that corrected clock, so the error cancels out.
            </li>
            <li>
              The offset is only fresh as of the last sync. If the clock changes, it <b>re-syncs</b> — automatically on tab focus, network reconnect, or an interval. Turn <b>Auto-resync</b> off and the synced timer drifts too, until you hit <b>Resync now</b>.
            </li>
          </ol>
        </div>

        <p style={s.footnote}>
          Both timers target the same instant (~2&nbsp;min out). Device clock reads{' '}
          <code style={s.code}>Date.now() + skew</code>; the mocked server returns the true time. Refresh to restart.
        </p>
      </div>
    </div>
  );
}

function ClockCard(props: {
  tag: string;
  title: string;
  note: string;
  countdown: CountdownResult;
  color: string;
  badge: string;
  badgeBad: boolean;
  emphasize: boolean;
}) {
  const { tag, title, note, countdown, color, badge, badgeBad, emphasize } = props;
  return (
    <div
      style={{
        ...s.card,
        borderColor: emphasize ? 'rgba(240,97,109,0.55)' : C.line,
        boxShadow: emphasize ? '0 0 0 1px rgba(240,97,109,0.25)' : 'none',
      }}
    >
      <div style={s.cardHead}>
        <span style={{ ...s.cardTag, color }}>{tag}</span>
        <span
          style={{
            ...s.cardBadge,
            color: badgeBad ? C.bad : C.good,
            borderColor: badgeBad ? 'rgba(240,97,109,0.4)' : 'rgba(52,211,153,0.4)',
          }}
        >
          {badge}
        </span>
      </div>
      <div style={s.cardTitle}>{title}</div>
      <div style={s.cardNote}>{note}</div>
      <div style={{ ...s.time, color }}>{countdown.isComplete ? '00:00:00' : format(countdown)}</div>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{props.label}</div>
      <div style={s.statValue}>{props.value}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100%',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '64px 20px 80px',
    background:
      'linear-gradient(180deg, #0d131b 0%, #0b0f14 40%), radial-gradient(900px 400px at 80% -5%, rgba(56,189,248,0.08), transparent)',
  },
  container: { width: '100%', maxWidth: 760 },
  header: { marginBottom: 28 },
  eyebrow: {
    fontFamily: C.mono,
    fontSize: 12,
    letterSpacing: '0.04em',
    color: C.action,
    background: 'rgba(56,189,248,0.08)',
    border: '1px solid rgba(56,189,248,0.2)',
    display: 'inline-block',
    padding: '5px 10px',
    borderRadius: 7,
    marginBottom: 16,
  },
  h1: { margin: '0 0 12px', fontSize: 'clamp(26px, 4.5vw, 36px)', lineHeight: 1.1, letterSpacing: '-0.02em' },
  subtitle: { margin: 0, color: C.muted, fontSize: 15.5, lineHeight: 1.6, maxWidth: '60ch' },
  code: {
    fontFamily: C.mono,
    fontSize: '0.88em',
    background: C.surfaceMuted,
    border: `1px solid ${C.line}`,
    padding: '1px 5px',
    borderRadius: 5,
    color: C.text,
  },
  links: { display: 'flex', gap: 16, marginTop: 16 },
  link: { color: C.action, textDecoration: 'none', fontSize: 14, fontWeight: 600 },

  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 },
  card: {
    padding: '18px 20px 22px',
    borderRadius: 14,
    border: `1px solid ${C.line}`,
    background: C.surface,
    transition: 'border-color 160ms ease, box-shadow 160ms ease',
  },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTag: { fontFamily: C.mono, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700 },
  cardBadge: {
    fontFamily: C.mono,
    fontSize: 10.5,
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid',
  },
  cardTitle: { fontFamily: C.mono, fontSize: 14, marginTop: 12, color: C.text },
  cardNote: { color: C.faint, fontSize: 12.5, marginTop: 3 },
  time: {
    fontFamily: C.mono,
    fontSize: 'clamp(30px, 7vw, 42px)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    marginTop: 14,
    letterSpacing: '0.02em',
  },

  verdict: { fontSize: 13.5, minHeight: 20, margin: '16px 2px', fontWeight: 500, lineHeight: 1.5 },

  panel: { padding: 20, borderRadius: 14, background: C.surface, border: `1px solid ${C.line}` },
  panelRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  panelLabel: { fontSize: 14, color: C.text },
  skewValue: { fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: C.action, fontVariantNumeric: 'tabular-nums' },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 18,
    flexWrap: 'wrap',
  },
  toggle: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: C.text, cursor: 'pointer' },
  toggleHint: { color: C.faint },
  btnRow: { display: 'flex', gap: 10, marginLeft: 'auto' },
  ghostBtn: {
    padding: '8px 14px',
    borderRadius: 9,
    border: `1px solid ${C.line}`,
    background: 'transparent',
    color: C.muted,
    cursor: 'pointer',
    fontSize: 13.5,
    fontWeight: 600,
  },
  primaryBtn: {
    padding: '8px 16px',
    borderRadius: 9,
    border: 'none',
    background: C.action,
    color: '#04222e',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 13.5,
  },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 },
  stat: { padding: '12px 14px', borderRadius: 11, background: C.surfaceMuted, border: `1px solid ${C.line}` },
  statLabel: { color: C.faint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: C.mono },
  statValue: { fontFamily: C.mono, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums', fontSize: 14 },

  how: { marginTop: 26, padding: '18px 22px', borderRadius: 14, background: C.surfaceMuted, border: `1px solid ${C.line}` },
  howTitle: { fontFamily: C.mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.faint, marginBottom: 10 },
  howList: { margin: 0, paddingLeft: 20, color: C.muted, fontSize: 13.5, lineHeight: 1.65, display: 'grid', gap: 8 },

  footnote: { color: C.faint, fontSize: 12, lineHeight: 1.6, marginTop: 24 },
};
