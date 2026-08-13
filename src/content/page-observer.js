import { createLogger } from '../shared/logger.js';

const log = createLogger('observer');

export function createPageObserver(callback, options = {}) {
  const delay = options.debounce || 800;
  let timer = null;
  let suspended = false;

  const observer = new MutationObserver(() => {
    if (suspended) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        callback();
      } catch (e) {
        log.warn('Page observer callback error', { error: e?.message });
      }
    }, delay);
  });

  function observe(root) {
    const target = root || (typeof document !== 'undefined' ? document.body : null);
    if (!target || !target.nodeType) return;
    observer.observe(target, { childList: true, subtree: true });
    log.debug('Observer started');
  }

  function disconnect() {
    if (timer) clearTimeout(timer);
    timer = null;
    observer.disconnect();
  }

  function suspend(flag) {
    suspended = flag;
  }

  return { observe, disconnect, suspend, reconnect: observe };
}
