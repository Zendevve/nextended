/**
 * Nexus Mods Download Tools - Toast Notification System
 * Hardware-accelerated, dark-theme native toast notifications.
 */

const VALID_TYPES = new Set(['info', 'success', 'warning', 'error']);

const ICONS = {
  info: `<svg class="nxdt-toast-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 12h-1.5V7h1.5v5zm0-6.5h-1.5v-1.5h1.5v1.5z"/></svg>`,
  success: `<svg class="nxdt-toast-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`,
  warning: `<svg class="nxdt-toast-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.39A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.563L6.457 1.047zM8 4a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0v-4.5A.75.75 0 008 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/></svg>`,
  error: `<svg class="nxdt-toast-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`,
};

/**
 * Finds or creates the global toast container element.
 * @returns {HTMLElement|null}
 */
export function getOrCreateToastContainer() {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById('nxdt-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'nxdt-toast-container';
    container.className = 'nxdt-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    const parent = document.body || document.documentElement;
    if (parent) {
      parent.appendChild(container);
    }
  }
  return container;
}

/**
 * Displays a toast notification.
 *
 * @param {string} message - Message text or node description to display.
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Toast category.
 * @param {number} [duration=3000] - Auto-dismiss timeout in ms (0 to disable).
 * @returns {HTMLElement|null} The created toast element.
 */
export function showToast(message, type = 'info', duration = 3000) {
  if (typeof document === 'undefined') return null;

  const container = getOrCreateToastContainer();
  if (!container) return null;

  let normalizedType = (type || 'info').toLowerCase();
  if (normalizedType === 'warn') normalizedType = 'warning';
  if (!VALID_TYPES.has(normalizedType)) normalizedType = 'info';

  const toast = document.createElement('div');
  toast.className = `nxdt-toast nxdt-toast-${normalizedType}`;
  toast.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');
  toast.tabIndex = 0;

  const iconWrap = document.createElement('div');
  iconWrap.className = 'nxdt-toast-icon-wrap';
  iconWrap.innerHTML = ICONS[normalizedType] || ICONS.info;
  toast.appendChild(iconWrap);

  const textWrap = document.createElement('div');
  textWrap.className = 'nxdt-toast-content';
  const msgSpan = document.createElement('span');
  msgSpan.className = 'nxdt-toast-msg';
  msgSpan.textContent = String(message ?? '');
  textWrap.appendChild(msgSpan);
  toast.appendChild(textWrap);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nxdt-toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = '&times;';
  toast.appendChild(closeBtn);

  let isDismissed = false;
  let timer = null;

  const dismiss = () => {
    if (isDismissed) return;
    isDismissed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toast.classList.add('nxdt-toast-hiding');
    const removeEl = () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    };
    toast.addEventListener('animationend', removeEl, { once: true });
    setTimeout(removeEl, 300);
  };

  toast.dismiss = dismiss;

  toast.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  container.appendChild(toast);

  if (typeof duration === 'number' && duration > 0) {
    timer = setTimeout(dismiss, duration);
  }

  return toast;
}
