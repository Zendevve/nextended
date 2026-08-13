import { describe, it, expect } from 'vitest';
import { ERROR_CODES, NexusDownloadError } from '../src/shared/errors.js';

describe('errors', () => {
  it('builds a structured error', () => {
    const e = new NexusDownloadError(ERROR_CODES.CLOUDFLARE, 'blocked', { fileId: '1' });
    expect(e.code).toBe(ERROR_CODES.CLOUDFLARE);
    expect(e.message).toBe('blocked');
    expect(e.context.fileId).toBe('1');
    expect(e instanceof Error).toBe(true);
  });

  it('defaults code to UNKNOWN', () => {
    const e = new NexusDownloadError(undefined, 'boom');
    expect(e.code).toBe(ERROR_CODES.UNKNOWN);
  });

  it('serializes to JSON', () => {
    const e = new NexusDownloadError(ERROR_CODES.AUTH_ERROR, 'login', { a: 1 });
    const json = e.toJSON();
    expect(json.code).toBe(ERROR_CODES.AUTH_ERROR);
    expect(json.context.a).toBe(1);
  });
});
