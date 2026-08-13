export const ERROR_CODES = {
  AUTH_ERROR: 'AUTH_ERROR',
  CLOUDFLARE: 'CLOUDFLARE',
  REQUIREMENTS: 'REQUIREMENTS',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  INVALID_URL: 'INVALID_URL',
  TIMEOUT: 'TIMEOUT',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_ARCHIVED: 'NOT_ARCHIVED',
  UNKNOWN: 'UNKNOWN',
};

export class NexusDownloadError extends Error {
  constructor(code, message, context = {}) {
    super(message || code);
    this.name = 'NexusDownloadError';
    this.code = code || ERROR_CODES.UNKNOWN;
    this.context = context;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

export function isNexusError(value) {
  return value instanceof NexusDownloadError;
}

export function errorFromCode(code, message, context) {
  return new NexusDownloadError(code, message, context);
}
