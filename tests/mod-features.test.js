import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequirementsBundler } from '../src/content/requirements-bundler.js';
import { SearchCardActions } from '../src/content/search-card-actions.js';
import { ArchiveInspector } from '../src/content/archive-inspector.js';
import { renderDownloadFallback, triggerDownload, resetNoWaitState } from '../src/content/no-wait.js';
import { MESSAGE_TYPES } from '../src/shared/constants.js';

describe('RequirementsBundler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.happyDOM.setURL('https://www.nexusmods.com/stardewvalley/mods/1234');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('injects trigger button with CSS classes and no inline styles', () => {
    document.body.innerHTML = `
      <div class="actions"></div>
      <h1>Cool Mod</h1>
    `;

    const bundler = new RequirementsBundler();
    bundler.injectBundleButton();

    const btn = document.querySelector('[data-nxdt-bundle-btn="true"]');
    expect(btn).not.toBeNull();
    expect(btn.className).toContain('btn');
    expect(btn.className).toContain('inline-flex');
    expect(btn.className).toContain('nxdt-bundle-trigger-btn');
    expect(btn.getAttribute('style')).toBeNull();
    expect(btn.textContent).toContain('Download Mod + Requirements');
  });

  it('opens modal with search filter, toolbar, and requirements list', async () => {
    document.body.innerHTML = `
      <div class="actions"></div>
      <h1 class="mod-name">Stardew Expanded</h1>
      <table class="table-requirements">
        <tbody>
          <tr>
            <td><a href="https://www.nexusmods.com/stardewvalley/mods/2400">SMAPI</a></td>
            <td class="notes">Required loader</td>
          </tr>
          <tr>
            <td><a href="https://github.com/example/custom-framework">External Framework</a></td>
            <td class="notes">Off-site dependency</td>
          </tr>
        </tbody>
      </table>
    `;

    const bundler = new RequirementsBundler();
    await bundler.openRequirementsModal();

    const modal = document.querySelector('.nxdt-modal-overlay');
    expect(modal).not.toBeNull();

    // Check modal contents
    expect(modal.querySelector('.nxdt-modal-desc').textContent).toContain('Stardew Expanded');
    expect(modal.querySelector('#nxdt-req-search')).not.toBeNull();
    expect(modal.querySelector('#nxdt-req-select-all')).not.toBeNull();
    expect(modal.querySelector('#nxdt-req-select-nexus')).not.toBeNull();
    expect(modal.querySelector('#nxdt-req-deselect-all')).not.toBeNull();

    const items = modal.querySelectorAll('.nxdt-req-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('SMAPI');
    expect(items[0].textContent).toContain('Nexus');
    expect(items[1].textContent).toContain('External Framework');
    expect(items[1].textContent).toContain('Off-Site');
  });

  it('filters requirements live via search input', async () => {
    document.body.innerHTML = `
      <h1>Mod With Many Reqs</h1>
      <table class="table-requirements">
        <tbody>
          <tr><td><a href="https://www.nexusmods.com/stardewvalley/mods/101">Content Patcher</a></td></tr>
          <tr><td><a href="https://www.nexusmods.com/stardewvalley/mods/102">SpaceCore</a></td></tr>
          <tr><td><a href="https://www.nexusmods.com/stardewvalley/mods/103">Json Assets</a></td></tr>
        </tbody>
      </table>
    `;

    const bundler = new RequirementsBundler();
    await bundler.openRequirementsModal();

    const modal = document.querySelector('.nxdt-modal-overlay');
    const searchInput = modal.querySelector('#nxdt-req-search');
    const items = modal.querySelectorAll('.nxdt-req-item');

    // Filter by "space"
    searchInput.value = 'space';
    searchInput.dispatchEvent(new Event('input'));

    expect(items[0].style.display).toBe('none');
    expect(items[1].style.display).toBe('');
    expect(items[2].style.display).toBe('none');

    // Clear search
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));

    expect(items[0].style.display).toBe('');
    expect(items[1].style.display).toBe('');
    expect(items[2].style.display).toBe('');
  });

  it('supports quick-select buttons (Select All, Nexus Only, Deselect All)', async () => {
    document.body.innerHTML = `
      <h1>Test Mod</h1>
      <table class="table-requirements">
        <tbody>
          <tr><td><a href="https://www.nexusmods.com/stardewvalley/mods/1">Nexus Mod</a></td></tr>
          <tr><td><a href="https://example.com/offsite">Offsite Mod</a></td></tr>
        </tbody>
      </table>
    `;

    const bundler = new RequirementsBundler();
    await bundler.openRequirementsModal();

    const modal = document.querySelector('.nxdt-modal-overlay');
    const deselectBtn = modal.querySelector('#nxdt-req-deselect-all');
    const selectNexusBtn = modal.querySelector('#nxdt-req-select-nexus');
    const selectAllBtn = modal.querySelector('#nxdt-req-select-all');

    const cb0 = modal.querySelector('input[data-idx="0"]');
    const cb1 = modal.querySelector('input[data-idx="1"]');

    // Deselect all
    deselectBtn.click();
    expect(cb0.checked).toBe(false);
    expect(cb1.checked).toBe(false);

    // Select Nexus Only
    selectNexusBtn.click();
    expect(cb0.checked).toBe(true);
    expect(cb1.checked).toBe(false);

    // Select All
    selectAllBtn.click();
    expect(cb0.checked).toBe(true);
    expect(cb1.checked).toBe(true);
  });

  it('closes modal on close button, cancel button, outside click, and Escape key', async () => {
    document.body.innerHTML = `<h1>Test Mod</h1>`;
    const bundler = new RequirementsBundler();

    // Close button
    await bundler.openRequirementsModal();
    expect(document.querySelector('.nxdt-modal-overlay')).not.toBeNull();
    document.getElementById('nxdt-req-close').click();
    expect(document.querySelector('.nxdt-modal-overlay')).toBeNull();

    // Cancel button
    await bundler.openRequirementsModal();
    expect(document.querySelector('.nxdt-modal-overlay')).not.toBeNull();
    document.getElementById('nxdt-req-cancel').click();
    expect(document.querySelector('.nxdt-modal-overlay')).toBeNull();

    // Escape key
    await bundler.openRequirementsModal();
    expect(document.querySelector('.nxdt-modal-overlay')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.nxdt-modal-overlay')).toBeNull();

    // Backdrop click
    await bundler.openRequirementsModal();
    const overlay = document.querySelector('.nxdt-modal-overlay');
    expect(overlay).not.toBeNull();
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.nxdt-modal-overlay')).toBeNull();
  });

  it('enqueues selected items and triggers success toast notification', async () => {
    document.body.innerHTML = `
      <h1>Main Mod</h1>
      <table class="table-requirements">
        <tbody>
          <tr><td><a href="https://www.nexusmods.com/stardewvalley/mods/555">Dependency Mod</a></td></tr>
        </tbody>
      </table>
    `;

    const sendMessageSpy = vi.fn().mockResolvedValue({ success: true });
    chrome.runtime.sendMessage = sendMessageSpy;

    const bundler = new RequirementsBundler();
    await bundler.openRequirementsModal();

    const enqueueBtn = document.getElementById('nxdt-req-enqueue');
    await enqueueBtn.click();

    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MESSAGE_TYPES.ENQUEUE_ITEMS,
        payload: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ modName: 'Main Mod' }),
            expect.objectContaining({ modName: 'Dependency Mod', modId: '555' }),
          ]),
        }),
      })
    );

    // Check toast was created
    const toast = document.querySelector('.nxdt-toast-success');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Queued 2 mods to background download');
    expect(document.querySelector('.nxdt-modal-overlay')).toBeNull();
  });

  it('dynamically updates requirement count badge when toggling checkboxes', async () => {
    document.body.innerHTML = `
      <h1>Test Mod</h1>
      <table class="table-requirements">
        <tbody>
          <tr><td><a href="https://www.nexusmods.com/stardewvalley/mods/1">Nexus Mod</a></td></tr>
          <tr><td><a href="https://example.com/offsite">Offsite Mod</a></td></tr>
        </tbody>
      </table>
    `;

    const bundler = new RequirementsBundler();
    await bundler.openRequirementsModal();

    const countSpan = document.getElementById('nxdt-req-count');
    expect(countSpan.textContent).toBe('2');

    const cb0 = document.querySelector('input[data-idx="0"]');
    cb0.checked = false;
    cb0.dispatchEvent(new Event('change', { bubbles: true }));
    expect(countSpan.textContent).toBe('1');

    const cb1 = document.querySelector('input[data-idx="1"]');
    cb1.checked = false;
    cb1.dispatchEvent(new Event('change', { bubbles: true }));
    expect(countSpan.textContent).toBe('0');
  });
});

describe('SearchCardActions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.happyDOM.setURL('https://www.nexusmods.com/stardewvalley/mods');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('injects quick buttons and handles queue action with visual state & toast', async () => {
    document.body.innerHTML = `
      <div class="mod-tile">
        <a href="https://www.nexusmods.com/stardewvalley/mods/777" class="mod-name">Awesome Mod</a>
        <div class="tile-actions"></div>
      </div>
    `;

    const sendMessageSpy = vi.fn().mockResolvedValue({ success: true });
    chrome.runtime.sendMessage = sendMessageSpy;

    const actions = new SearchCardActions();
    actions.processCards();

    const container = document.querySelector('.nxdt-card-actions');
    expect(container).not.toBeNull();

    const nxmBtn = container.querySelector('.nxdt-card-btn-nxm');
    expect(nxmBtn).not.toBeNull();
    expect(nxmBtn.href).toContain('mods/777?tab=files');

    const queueBtn = container.querySelector('.nxdt-card-btn-queue');
    expect(queueBtn).not.toBeNull();
    expect(queueBtn.textContent).toBe('Queue');

    // Click Queue button
    await queueBtn.click();

    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MESSAGE_TYPES.ENQUEUE_ITEMS,
        payload: {
          items: [
            expect.objectContaining({
              modId: '777',
              gameDomain: 'stardewvalley',
              modName: 'Awesome Mod',
            }),
          ],
        },
      })
    );

    // Visual feedback morphing
    expect(queueBtn.textContent).toBe('Queued');
    expect(queueBtn.classList.contains('nxdt-card-btn-queued')).toBe(true);

    // Toast notification
    const toast = document.querySelector('.nxdt-toast-success');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Added "Awesome Mod" to queue');

    // Revert after 2 seconds
    vi.advanceTimersByTime(2000);
    expect(queueBtn.textContent).toBe('Queue');
    expect(queueBtn.classList.contains('nxdt-card-btn-queued')).toBe(false);
  });

  it('shows warning toast if queue fails', async () => {
    document.body.innerHTML = `
      <div class="mod-tile">
        <a href="https://www.nexusmods.com/stardewvalley/mods/888" class="mod-name">Failing Mod</a>
      </div>
    `;

    chrome.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('Extension context invalidated'));

    const actions = new SearchCardActions();
    actions.processCards();

    const queueBtn = document.querySelector('.nxdt-card-btn-queue');
    await queueBtn.click();

    const toast = document.querySelector('.nxdt-toast-warning');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Failed to queue "Failing Mod"');
  });
});

describe('ArchiveInspector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.happyDOM.setURL('https://www.nexusmods.com/stardewvalley/mods/1234?tab=files');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('injects inspector badge and toggles panel with badges and icons', () => {
    document.body.innerHTML = `
      <div class="file-expander">
        <div class="file-expander-header" data-file-id="999">
          <div class="header-actions"></div>
        </div>
      </div>
    `;

    const inspector = new ArchiveInspector();
    inspector.processFiles();

    const btn = document.querySelector('.nxdt-inspect-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('Inspect');

    // Click to open inspection panel
    btn.click();

    const panel = document.querySelector('.nxdt-inspection-panel');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('File #999');
    expect(panel.textContent).toContain('ZIP / 7Z / RAR');
    expect(panel.textContent).toContain('FOMOD / Standard');
    expect(panel.textContent).toContain('Verified Clean');
  });

  it('closes inspection panel on close button, Escape key, and outside click', () => {
    document.body.innerHTML = `
      <div class="file-expander">
        <div class="file-expander-header" data-file-id="999">
          <div class="header-actions"></div>
        </div>
      </div>
      <div id="outside-area">Outside</div>
    `;

    const inspector = new ArchiveInspector();
    inspector.processFiles();
    const btn = document.querySelector('.nxdt-inspect-btn');

    // 1. Close button
    btn.click();
    expect(document.querySelector('.nxdt-inspection-panel')).not.toBeNull();
    document.getElementById('nxdt-inspect-close').click();
    expect(document.querySelector('.nxdt-inspection-panel')).toBeNull();

    // 2. Escape key
    btn.click();
    expect(document.querySelector('.nxdt-inspection-panel')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.nxdt-inspection-panel')).toBeNull();

    // 3. Outside click
    btn.click();
    expect(document.querySelector('.nxdt-inspection-panel')).not.toBeNull();
    vi.advanceTimersByTime(10); // flush setTimeout for click listener
    document.getElementById('outside-area').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.nxdt-inspection-panel')).toBeNull();
  });
});

describe('NoWait Fallback Link & Banner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('triggers download and attaches fallback notice', () => {
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node && node.tagName === 'IFRAME') {
        return node;
      }
      return originalAppendChild(node);
    });

    triggerDownload('nxm://stardewvalley/mods/123/files/456');

    const iframe = appendSpy.mock.calls.map((c) => c[0]).find((n) => n && n.tagName === 'IFRAME');
    expect(iframe).toBeTruthy();
    expect(iframe.src).toBe('nxm://stardewvalley/mods/123/files/456');

    const notice = document.querySelector('[data-nxdt-fallback-notice]');
    expect(notice).not.toBeNull();
    appendSpy.mockRestore();
  });
  it('renders fallback notice with link and cleanup on reset', () => {
    document.body.innerHTML = `
      <div class="slow-download">
        <button id="slowDownloadButton">Slow Download</button>
      </div>
    `;

    const notice = renderDownloadFallback('https://files.nexus-cdn.com/file.zip');
    expect(notice).not.toBeNull();
    expect(notice.getAttribute('data-nxdt-fallback-notice')).toBe('true');
    expect(notice.querySelector('.nxdt-fallback-link')).not.toBeNull();
    expect(notice.querySelector('.nxdt-fallback-link').href).toBe('https://files.nexus-cdn.com/file.zip');

    // Check reset cleans it up
    resetNoWaitState();
    expect(document.querySelector('[data-nxdt-fallback-notice]')).toBeNull();
  });
});
