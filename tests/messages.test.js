import { describe, it, expect } from 'vitest';
import { MessageFactory, createMessage } from '../src/shared/messages.js';
import { MESSAGE_TYPES } from '../src/shared/constants.js';

describe('messages', () => {
  it('has consistent message shape', () => {
    const msg = createMessage('X', { a: 1 });
    expect(msg.type).toBe('X');
    expect(msg.payload).toEqual({ a: 1 });
  });

  it('builds resolve download payload with slug', () => {
    const msg = MessageFactory.resolveDownload(
      '123',
      '1704',
      'manual',
      'skyrimspecialedition'
    );
    expect(msg.type).toBe(MESSAGE_TYPES.RESOLVE_DOWNLOAD);
    expect(msg.payload).toEqual({
      fileId: '123',
      gameId: '1704',
      mode: 'manual',
      slug: 'skyrimspecialedition',
    });
  });

  it('builds download error payload', () => {
    const msg = MessageFactory.downloadError('123', 'CLOUDFLARE', 'blocked');
    expect(msg.payload.code).toBe('CLOUDFLARE');
    expect(msg.payload.message).toBe('blocked');
  });
});
