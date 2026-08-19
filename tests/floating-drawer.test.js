import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FloatingDrawer } from '../src/content/floating-drawer.js';
import {
  MESSAGE_TYPES,
  QUEUE_STATUS,
  ITEM_STATUS,
} from '../src/shared/constants.js';

describe('FloatingDrawer UI & Actions', () => {
  let drawer;

  beforeEach(() => {
    document.body.innerHTML = '';
    drawer = new FloatingDrawer();
    drawer.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders dock button with queue progress and active badge', () => {
    drawer.updateState({
      status: QUEUE_STATUS.RUNNING,
      counts: { total: 5, completed: 2, failed: 1, active: 2, pending: 0 },
      items: [
        { id: '1', modName: 'Mod 1', fileName: 'mod1.zip', status: ITEM_STATUS.COMPLETED },
        { id: '2', modName: 'Mod 2', fileName: 'mod2.zip', status: ITEM_STATUS.COMPLETED },
        { id: '3', modName: 'Mod 3', fileName: 'mod3.zip', status: ITEM_STATUS.DOWNLOADING },
        { id: '4', modName: 'Mod 4', fileName: 'mod4.zip', status: ITEM_STATUS.RESOLVING },
        { id: '5', modName: 'Mod 5', fileName: 'mod5.zip', status: ITEM_STATUS.FAILED, error: 'Network error' },
      ],
    });

    const dockBtn = document.getElementById('nxdt-dock-btn');
    expect(dockBtn).not.toBeNull();
    expect(dockBtn.textContent).toContain('2/5');
    expect(dockBtn.textContent).toContain('2 active');
    expect(dockBtn.textContent).toContain('1 failed');
  });

  it('opens and closes drawer when dock button and close button are clicked', () => {
    drawer.updateState({
      status: QUEUE_STATUS.RUNNING,
      counts: { total: 1, completed: 0, failed: 0, active: 1, pending: 0 },
      items: [{ id: '1', modName: 'Mod 1', status: ITEM_STATUS.DOWNLOADING }],
    });

    const dockBtn = document.getElementById('nxdt-dock-btn');
    dockBtn.click();

    expect(drawer.isOpen).toBe(true);
    const panel = document.getElementById('nxdt-drawer-panel');
    expect(panel).not.toBeNull();

    const closeBtn = document.getElementById('nxdt-drawer-close');
    closeBtn.click();

    expect(drawer.isOpen).toBe(false);
    expect(document.getElementById('nxdt-drawer-panel')).toBeNull();
  });

  it('renders Buy Me a Coffee link in footer when drawer is open', () => {
    drawer.updateState({
      status: QUEUE_STATUS.IDLE,
      counts: { total: 1, completed: 1, failed: 0, active: 0, pending: 0 },
      items: [{ id: '1', modName: 'Mod 1', status: ITEM_STATUS.COMPLETED }],
    });

    drawer.open();
    const footer = document.querySelector('.nxdt-drawer-footer');
    expect(footer).not.toBeNull();

    const coffeeLink = footer.querySelector('.nxdt-drawer-coffee-link');
    expect(coffeeLink).not.toBeNull();
    expect(coffeeLink.getAttribute('href')).toBe('https://buymeacoffee.com/zendevve');
    expect(coffeeLink.getAttribute('target')).toBe('_blank');
    expect(coffeeLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(coffeeLink.getAttribute('title')).toBe('Support development on Buy Me a Coffee');
    expect(coffeeLink.textContent).toContain('Buy Me a Coffee');
  });

  it('closes open drawer on Escape key press and cleans up listener', () => {
    drawer.updateState({
      status: QUEUE_STATUS.RUNNING,
      counts: { total: 1, completed: 0, failed: 0, active: 1, pending: 0 },
      items: [{ id: '1', modName: 'Mod 1', status: ITEM_STATUS.DOWNLOADING }],
    });

    drawer.open();
    expect(drawer.isOpen).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(drawer.isOpen).toBe(false);

    // Further Escape presses do nothing
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(drawer.isOpen).toBe(false);
  });

  it('triggers pause and resume actions with toast notifications', async () => {
    const sendCalls = [];
    chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      sendCalls.push(msg);
      cb?.({ success: true });
    });

    drawer.updateState({
      status: QUEUE_STATUS.RUNNING,
      counts: { total: 2, completed: 0, failed: 0, active: 1, pending: 1 },
      items: [{ id: '1', modName: 'Mod 1', status: ITEM_STATUS.DOWNLOADING }],
    });
    drawer.open();

    const pauseBtn = document.getElementById('nxdt-queue-pause');
    expect(pauseBtn).not.toBeNull();
    pauseBtn.click();

    expect(sendCalls.some((c) => c.type === MESSAGE_TYPES.QUEUE_PAUSE)).toBe(true);
    const toast = document.querySelector('.nxdt-toast');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Queue paused');

    // Update state to PAUSED
    drawer.updateState({ status: QUEUE_STATUS.PAUSED });
    const resumeBtn = document.getElementById('nxdt-queue-resume');
    expect(resumeBtn).not.toBeNull();
    resumeBtn.click();

    expect(sendCalls.some((c) => c.type === MESSAGE_TYPES.QUEUE_RESUME)).toBe(true);
    expect(document.body.textContent).toContain('Queue resumed');
  });

  it('triggers clear finished and retry failed actions with toasts', async () => {
    const sendCalls = [];
    chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      sendCalls.push(msg);
      cb?.({ success: true });
    });

    drawer.updateState({
      status: QUEUE_STATUS.IDLE,
      counts: { total: 2, completed: 1, failed: 1, active: 0, pending: 0 },
      items: [
        { id: '1', modName: 'Mod 1', status: ITEM_STATUS.COMPLETED },
        { id: '2', modName: 'Mod 2', status: ITEM_STATUS.FAILED, error: 'Failed' },
      ],
    });
    drawer.open();

    const clearBtn = document.getElementById('nxdt-queue-clear');
    expect(clearBtn).not.toBeNull();
    clearBtn.click();

    expect(sendCalls.some((c) => c.type === MESSAGE_TYPES.QUEUE_CLEAR)).toBe(true);
    expect(document.body.textContent).toContain('Queue cleared');

    const retryBtn = document.getElementById('nxdt-queue-retry');
    expect(retryBtn).not.toBeNull();
    retryBtn.click();

    expect(sendCalls.some((c) => c.type === MESSAGE_TYPES.QUEUE_RETRY_FAILED)).toBe(true);
    expect(document.body.textContent).toContain('Retrying failed downloads');
  });

  it('skips item and exports list to clipboard with toast', async () => {
    const sendCalls = [];
    chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      sendCalls.push(msg);
      cb?.({ success: true });
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    drawer.updateState({
      status: QUEUE_STATUS.RUNNING,
      counts: { total: 1, completed: 0, failed: 0, active: 0, pending: 1 },
      items: [{ id: '99', modName: 'Special Mod', fileName: 'mod.zip', fileId: '99', status: ITEM_STATUS.PENDING }],
    });
    drawer.open();

    const skipBtn = document.querySelector('.nxdt-btn-skip');
    expect(skipBtn).not.toBeNull();
    skipBtn.click();

    expect(sendCalls.some((c) => c.type === MESSAGE_TYPES.QUEUE_SKIP_ITEM && c.payload.itemId === '99')).toBe(true);
    expect(document.body.textContent).toContain('Download skipped');

    const exportBtn = document.getElementById('nxdt-queue-export');
    expect(exportBtn).not.toBeNull();
    exportBtn.click();

    expect(writeTextMock).toHaveBeenCalled();
    expect(document.body.textContent).toContain('copied to clipboard');
  });
});
