import { describe, it, expect } from 'vitest';
import { MessageFactory, createMessage } from '../src/shared/messages.js';
import { MESSAGE_TYPES } from '../src/shared/constants.js';

describe('messages', () => {
  it('has consistent message shape', () => {
    const msg = createMessage('X', { a: 1 });
    expect(msg.type).toBe('X');
    expect(msg.payload).toEqual({ a: 1 });
  });

  it('builds ping message', () => {
    const msg = MessageFactory.ping();
    expect(msg.type).toBe(MESSAGE_TYPES.PING);
    expect(msg.payload).toEqual({});
  });

});
