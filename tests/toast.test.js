import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast, getOrCreateToastContainer } from '../src/content/toast.js';

describe('Toast Notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates and reuses #nxdt-toast-container', () => {
    expect(document.getElementById('nxdt-toast-container')).toBeNull();

    const container1 = getOrCreateToastContainer();
    expect(container1).not.toBeNull();
    expect(container1.id).toBe('nxdt-toast-container');
    expect(container1.className).toContain('nxdt-toast-container');
    expect(document.body.contains(container1)).toBe(true);

    const container2 = getOrCreateToastContainer();
    expect(container2).toBe(container1);
  });

  it('renders a toast with default info type and message', () => {
    const toast = showToast('Operation completed');
    expect(toast).not.toBeNull();
    expect(toast.classList.contains('nxdt-toast')).toBe(true);
    expect(toast.classList.contains('nxdt-toast-info')).toBe(true);

    const container = document.getElementById('nxdt-toast-container');
    expect(container.contains(toast)).toBe(true);

    const msg = toast.querySelector('.nxdt-toast-msg');
    expect(msg).not.toBeNull();
    expect(msg.textContent).toBe('Operation completed');

    const icon = toast.querySelector('.nxdt-toast-icon');
    expect(icon).not.toBeNull();
  });

  it('renders success, warning, and error types', () => {
    const tSuccess = showToast('Success message', 'success');
    expect(tSuccess.classList.contains('nxdt-toast-success')).toBe(true);

    const tWarn = showToast('Warning message', 'warning');
    expect(tWarn.classList.contains('nxdt-toast-warning')).toBe(true);

    const tWarnAlias = showToast('Warn alias message', 'warn');
    expect(tWarnAlias.classList.contains('nxdt-toast-warning')).toBe(true);

    const tErr = showToast('Error message', 'error');
    expect(tErr.classList.contains('nxdt-toast-error')).toBe(true);
    expect(tErr.getAttribute('role')).toBe('alert');

    const tUnknown = showToast('Unknown type', 'invalid_type');
    expect(tUnknown.classList.contains('nxdt-toast-info')).toBe(true);
  });

  it('safely escapes HTML tags in message text', () => {
    const toast = showToast('<script>alert("xss")</script><b>Bold</b>');
    const msg = toast.querySelector('.nxdt-toast-msg');
    expect(msg.textContent).toBe('<script>alert("xss")</script><b>Bold</b>');
    expect(toast.querySelector('script')).toBeNull();
    expect(toast.querySelector('b')).toBeNull();
  });

  it('auto-dismisses after duration with animation class', () => {
    const toast = showToast('Temporary notification', 'info', 2000);
    const container = document.getElementById('nxdt-toast-container');
    expect(container.contains(toast)).toBe(true);

    // Fast-forward timer to trigger auto-dismiss
    vi.advanceTimersByTime(2000);
    expect(toast.classList.contains('nxdt-toast-hiding')).toBe(true);

    // Fast-forward past animation timeout to remove from DOM
    vi.advanceTimersByTime(350);
    expect(container.contains(toast)).toBe(false);
  });

  it('dismisses immediately on click', () => {
    const toast = showToast('Clickable notification', 'info', 5000);
    const container = document.getElementById('nxdt-toast-container');
    expect(container.contains(toast)).toBe(true);

    toast.click();
    expect(toast.classList.contains('nxdt-toast-hiding')).toBe(true);

    vi.advanceTimersByTime(350);
    expect(container.contains(toast)).toBe(false);
  });

  it('dismisses on close button click', () => {
    const toast = showToast('Dismissible notification', 'info', 5000);
    const closeBtn = toast.querySelector('.nxdt-toast-close');
    expect(closeBtn).not.toBeNull();

    closeBtn.click();
    expect(toast.classList.contains('nxdt-toast-hiding')).toBe(true);

    vi.advanceTimersByTime(350);
    expect(toast.parentNode).toBeNull();
  });

  it('supports programmatic dismiss method', () => {
    const toast = showToast('Manual dismiss', 'info', 0);
    expect(typeof toast.dismiss).toBe('function');

    toast.dismiss();
    expect(toast.classList.contains('nxdt-toast-hiding')).toBe(true);

    vi.advanceTimersByTime(350);
    expect(toast.parentNode).toBeNull();
  });
});
