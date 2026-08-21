import { MESSAGE_TYPES } from '../shared/constants.js';

export { MESSAGE_TYPES };

export function createMessage(type, payload) {
  return { type, payload: payload || {} };
}

export const MessageFactory = {
  ping: () => createMessage(MESSAGE_TYPES.PING),
};
