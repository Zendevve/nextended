export const Logger = {
  debug: (...args: unknown[]) => console.debug('[nextended]', ...args),
  info: (...args: unknown[]) => console.info('[nextended]', ...args),
  warn: (...args: unknown[]) => console.warn('[nextended]', ...args),
  error: (...args: unknown[]) => console.error('[nextended]', ...args)
};
