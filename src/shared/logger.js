import { LOG_LEVELS, LOG_PREFIX } from '../shared/constants.js';

class Logger {
  constructor(namespace) {
    this.namespace = namespace ? `${LOG_PREFIX} ${namespace}` : LOG_PREFIX;
    this.enabled = true;
    this.level = LOG_LEVELS.INFO;
  }

  _format(levelLabel, message, context) {
    const time = new Date().toISOString();
    const base = `${time} ${this.namespace} ${levelLabel} ${message}`;
    if (context) {
      try {
        return `${base} ${JSON.stringify(context)}`;
      } catch {
        return `${base} [unserializable context]`;
      }
    }
    return base;
  }

  _emit(level, levelLabel, message, context) {
    if (!this.enabled) return;
    if (level < this.level) return;
    const text = this._format(levelLabel, message, context);
    if (level >= LOG_LEVELS.ERROR) {
      console.error(text);
    } else if (level >= LOG_LEVELS.WARN) {
      console.warn(text);
    } else {
      console.log(text);
    }
  }

  debug(message, context) {
    this._emit(LOG_LEVELS.DEBUG, 'DEBUG', message, context);
  }

  info(message, context) {
    this._emit(LOG_LEVELS.INFO, 'INFO', message, context);
  }

  warn(message, context) {
    this._emit(LOG_LEVELS.WARN, 'WARN', message, context);
  }

  error(message, context) {
    this._emit(LOG_LEVELS.ERROR, 'ERROR', message, context);
  }

  setLevel(level) {
    this.level = typeof level === 'number' ? level : LOG_LEVELS[level];
  }
}

export function createLogger(namespace) {
  return new Logger(namespace);
}

export default {
  createLogger,
  Logger,
  LOG_LEVELS,
};
