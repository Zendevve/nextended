import { describe, it, expect } from 'vitest';
import { createLogger } from '../src/shared/logger.js';
import { LOG_LEVELS } from '../src/shared/constants.js';

describe('logger', () => {
  it('creates namespaced loggers with log level control', () => {
    const log = createLogger('test');
    expect(log.level).toBe(LOG_LEVELS.INFO);
    log.setLevel(LOG_LEVELS.DEBUG);
    expect(log.level).toBe(LOG_LEVELS.DEBUG);
  });

  it('formats messages with timestamp and namespace', () => {
    const log = createLogger('myns');
    const calls = [];
    const orig = console.log;
    console.log = (m) => calls.push(m);
    log.info('hello', { id: 1 });
    console.log = orig;
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain('[NXDT] myns INFO hello');
    expect(calls[0]).toContain('"id":1');
  });

  it('respects level filtering', () => {
    const log = createLogger('test');
    log.setLevel(LOG_LEVELS.WARN);
    const calls = [];
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = (m) => calls.push(['log', m]);
    console.warn = (m) => calls.push(['warn', m]);
    log.info('should not appear');
    log.warn('should appear');
    console.log = origLog;
    console.warn = origWarn;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('warn');
  });
});
