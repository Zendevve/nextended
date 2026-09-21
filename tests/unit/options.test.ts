/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import optionsHtml from '../../src/options/index.html?raw';
// Side-effect import: registers the DOMContentLoaded listener the tests dispatch.
import '../../src/options/options';
import { StorageManager } from '../../src/common/storage';
import { DEFAULT_CONFIG } from '../../src/common/config';
import { DownloadMethod, ExternalDownloaderMode } from '../../src/common/types';
import type { ExtensionConfig } from '../../src/common/types';

/**
 * The options page is driven through its real markup (src/options/index.html).
 * The script wires up inside a DOMContentLoaded handler, so each test mounts
 * the markup and dispatches that event manually; fake timers then advance the
 * 400 ms auto-save debounce.
 */

const NON_DEFAULTS: Partial<ExtensionConfig> = {
  autoStartDownload: false,
  autoCloseTab: false,
  closeTabDelayMs: 7500,
  skipRequirements: false,
  forceModManagerDownload: true,
  overrideFileNames: true,
  vpnMode: true,
  showAlertsOnError: false,
  pageShieldEnabled: false,
  requestTimeoutMs: 12000,
  downloadSpeedMb: 4.5,
  pauseBetweenDownloadSec: 30,
  handleArchivedFiles: false,
  downloadMethod: DownloadMethod.VORTEX,
  externalDownloader: {
    enabled: true,
    mode: ExternalDownloaderMode.ARIA2,
    rpcUrl: 'http://nas.local:6800/jsonrpc',
    secret: 's3cret'
  }
};

function q<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

/** Simulates a user edit: apply the value, then fire the event the wiring listens for. */
function editField(selector: string, value: string, event: 'input' | 'change'): void {
  const el = q<HTMLInputElement | HTMLSelectElement>(selector);
  el.value = value;
  el.dispatchEvent(new Event(event));
}

function toggle(selector: string, checked: boolean): void {
  const el = q<HTMLInputElement>(selector);
  el.checked = checked;
  el.dispatchEvent(new Event('change'));
}

async function bootOptionsPage(): Promise<void> {
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/
    .exec(optionsHtml)![1]
    // The page's own <script> is provided by the static import above; happy-dom
    // would otherwise try to fetch the relative module URL.
    .replace(/<script[\s\S]*?<\/script>/g, '');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.advanceTimersByTimeAsync(0);
}

describe('Options page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('populates every control from stored config', async () => {
    await StorageManager.setConfig(NON_DEFAULTS);

    await bootOptionsPage();

    expect(q<HTMLInputElement>('#autoStartDownload').checked).toBe(false);
    expect(q<HTMLInputElement>('#autoCloseTab').checked).toBe(false);
    expect(q<HTMLInputElement>('#closeTabDelayMs').value).toBe('7500');
    expect(q<HTMLInputElement>('#skipRequirements').checked).toBe(false);
    expect(q<HTMLInputElement>('#forceModManagerDownload').checked).toBe(true);
    expect(q<HTMLInputElement>('#overrideFileNames').checked).toBe(true);
    expect(q<HTMLInputElement>('#vpnMode').checked).toBe(true);
    expect(q<HTMLInputElement>('#showAlertsOnError').checked).toBe(false);
    expect(q<HTMLInputElement>('#pageShieldEnabled').checked).toBe(false);
    expect(q<HTMLInputElement>('#requestTimeoutMs').value).toBe('12000');
    expect(q<HTMLInputElement>('#requestTimeoutMs').min).toBe('1000');
    expect(q<HTMLInputElement>('#downloadSpeedMb').value).toBe('4.5');
    expect(q<HTMLInputElement>('#pauseBetweenDownloadSec').value).toBe('30');
    expect(q<HTMLInputElement>('#handleArchivedFiles').checked).toBe(false);
    expect(q<HTMLInputElement>('#radioVortex').checked).toBe(true);
    expect(q<HTMLInputElement>('#radioBrowser').checked).toBe(false);
    expect(q<HTMLInputElement>('#externalDownloaderEnabled').checked).toBe(true);
    expect(q<HTMLSelectElement>('#externalDownloaderMode').value).toBe('aria2');
    expect(q<HTMLInputElement>('#externalDownloaderRpcUrl').value).toBe('http://nas.local:6800/jsonrpc');
    expect(q<HTMLInputElement>('#externalDownloaderSecret').value).toBe('s3cret');
  });

  it('round-trips every control change through storage on auto-save', async () => {
    await StorageManager.setConfig(DEFAULT_CONFIG);

    await bootOptionsPage();

    toggle('#autoStartDownload', false);
    toggle('#autoCloseTab', false);
    editField('#closeTabDelayMs', '5000', 'input');
    toggle('#skipRequirements', false);
    toggle('#forceModManagerDownload', true);
    toggle('#overrideFileNames', true);
    toggle('#vpnMode', true);
    toggle('#showAlertsOnError', false);
    toggle('#pageShieldEnabled', false);
    editField('#requestTimeoutMs', '15000', 'input');
    toggle('#handleArchivedFiles', false);
    editField('#downloadSpeedMb', '9.9', 'input');
    editField('#pauseBetweenDownloadSec', '42', 'input');
    toggle('#radioVortex', true);
    editField('#externalDownloaderRpcUrl', 'http://aria2.local:6800/jsonrpc', 'input');
    editField('#externalDownloaderSecret', 'topsecret', 'input');
    toggle('#externalDownloaderEnabled', true);
    editField('#externalDownloaderMode', 'aria2', 'input');

    await vi.advanceTimersByTimeAsync(400);

    expect(await StorageManager.getConfig()).toEqual({
      ...DEFAULT_CONFIG,
      ...NON_DEFAULTS,
      closeTabDelayMs: 5000,
      requestTimeoutMs: 15000,
      downloadSpeedMb: 9.9,
      pauseBetweenDownloadSec: 42,
      externalDownloader: {
        enabled: true,
        mode: ExternalDownloaderMode.ARIA2,
        rpcUrl: 'http://aria2.local:6800/jsonrpc',
        secret: 'topsecret'
      }
    });
    expect(q('#saveToast').classList.contains('hidden')).toBe(false);
  });

  it('boots and saves with stale removed keys still in storage', async () => {
    localStorage.setItem(
      'nextended_config',
      JSON.stringify({ ...DEFAULT_CONFIG, vpnMode: true, playErrorSound: true, downloadButtonColor: true })
    );

    await bootOptionsPage();

    expect(q<HTMLInputElement>('#vpnMode').checked).toBe(true);
    expect(q<HTMLInputElement>('#autoStartDownload').checked).toBe(true);
    expect('playErrorSound' in DEFAULT_CONFIG).toBe(false);
    expect('downloadButtonColor' in DEFAULT_CONFIG).toBe(false);
    expect(optionsHtml).not.toContain('playErrorSound');
    expect(optionsHtml).not.toContain('downloadButtonColor');

    toggle('#overrideFileNames', true);
    await vi.advanceTimersByTimeAsync(400);

    const config = await StorageManager.getConfig();
    expect(config.overrideFileNames).toBe(true);
    expect(config.vpnMode).toBe(true);
  });

  it('reset restores defaults into storage and every control', async () => {
    await StorageManager.setConfig(NON_DEFAULTS);

    await bootOptionsPage();

    vi.stubGlobal('confirm', () => true);
    q<HTMLButtonElement>('#resetDefaultsBtn').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(await StorageManager.getConfig()).toEqual(DEFAULT_CONFIG);
    expect(q<HTMLInputElement>('#radioBrowser').checked).toBe(true);
    expect(q<HTMLInputElement>('#radioVortex').checked).toBe(false);
    expect(q<HTMLInputElement>('#requestTimeoutMs').value).toBe('30000');
    expect(q<HTMLInputElement>('#autoStartDownload').checked).toBe(true);
    expect(q<HTMLInputElement>('#showAlertsOnError').checked).toBe(true);
    expect(q<HTMLInputElement>('#forceModManagerDownload').checked).toBe(false);
  });
});
