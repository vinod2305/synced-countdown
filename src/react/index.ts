export { useServerTime } from './useServerTime.js';
export type { ServerTimeResult } from './useServerTime.js';
export { useServerCountdown } from './useServerCountdown.js';
export type {
  CountdownResult,
  UseServerCountdownOptions,
} from './useServerCountdown.js';

// Re-export core types that appear in the React API surface for convenience.
export type {
  ServerClock,
  ServerClockOptions,
  ClockStatus,
  FetchTime,
} from '../core/types.js';
export { createServerClock } from '../core/clock.js';
export { fetchTimeFromDateHeader, fetchTimeFromJson } from '../core/helpers.js';
