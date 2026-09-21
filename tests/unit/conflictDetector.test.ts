import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictDetector } from '../../src/content/modules/conflictDetector';
import { StorageManager } from '../../src/common/storage';
import { CONFLICT_SCRIPT_LABELS } from '../../src/common/types';

describe('ConflictDetector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.removeItem('nextended_conflict_ack');
    localStorage.removeItem('nextended_conflict_state');
  });

  describe('foreign marker detection', () => {
    it('detects the NDC toolbar mount signature', async () => {
      const main = document.createElement('main');
      const toolbar = document.createElement('div');
      toolbar.className = 'bg-surface-low w-full space-y-3 mt-4';
      main.appendChild(toolbar);
      document.body.appendChild(main);

      const state = await ConflictDetector.scan();

      expect(state.detected).toContain('ndc-toolbar');
      expect(state.unacknowledged).toContain('ndc-toolbar');
      expect(document.getElementById('nextended-conflict-banner')).not.toBeNull();
    });

    it('detects foreign data-nnwpp-* attributes', async () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-nnwpp-download', '1');
      document.body.appendChild(btn);

      const state = await ConflictDetector.scan();

      expect(state.detected).toEqual(['nnwpp-attrs']);
      expect(document.getElementById('nextended-conflict-banner')?.textContent).toContain(
        CONFLICT_SCRIPT_LABELS['nnwpp-attrs']
      );
    });

    it('detects the legacy archive wrapper class', async () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'allow-archive-downloads-wrapper';
      document.body.appendChild(wrapper);

      const state = await ConflictDetector.scan();

      expect(state.detected).toEqual(['legacy-archive-wrapper']);
      expect(document.getElementById('nextended-conflict-banner')?.textContent).toContain(
        CONFLICT_SCRIPT_LABELS['legacy-archive-wrapper']
      );
    });

    it('reports every detected script together', async () => {
      const toolbar = document.createElement('div');
      toolbar.className = 'bg-surface-low space-y-3 mt-4';
      const tagged = document.createElement('div');
      tagged.setAttribute('data-nnwpp-mode', 'fast');
      document.body.append(toolbar, tagged);

      const state = await ConflictDetector.scan();

      expect(state.detected.sort()).toEqual(['ndc-toolbar', 'nnwpp-attrs']);
      expect(state.unacknowledged.sort()).toEqual(['ndc-toolbar', 'nnwpp-attrs']);
    });
  });

  describe('nextended own injections never trigger', () => {
    it('ignores our collection container, archive actions and data-nextended-* attributes', async () => {
      // Exact clone of what CollectionEngine mounts — same utility classes as the foreign toolbar
      const own = document.createElement('div');
      own.id = 'nextended-collection-container';
      own.className = 'bg-surface-low w-full space-y-3 rounded-lg p-4 mt-4 text-white';
      const ownToolbar = document.createElement('div');
      ownToolbar.className = 'nextended-toolbar flex flex-col gap-3 w-full';
      ownToolbar.innerHTML = '<button data-nextended-manager-btn="1" data-nextended-is-nmm="1">go</button>';
      own.appendChild(ownToolbar);

      const archiveActions = document.createElement('div');
      archiveActions.className = 'nextended-archive-actions tabbed-block';
      archiveActions.innerHTML = '<a data-nextended-manager-btn="1" href="#">Mod manager download</a>';

      document.body.append(own, archiveActions);

      const state = await ConflictDetector.scan();

      expect(state.detected).toEqual([]);
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();
    });

    it('ignores a foreign signature nested inside our own mounts', async () => {
      const own = document.createElement('div');
      own.id = 'nextended-collection-container';
      const nested = document.createElement('div');
      nested.className = 'bg-surface-low space-y-3 mt-4';
      own.appendChild(nested);
      document.body.appendChild(own);

      const state = await ConflictDetector.scan();

      expect(state.detected).toEqual([]);
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();
    });
  });

  describe('banner lifecycle and acknowledgement', () => {
    it('shows exactly one banner per unacknowledged detection across repeated scans', async () => {
      const toolbar = document.createElement('div');
      toolbar.className = 'bg-surface-low space-y-3 mt-4';
      document.body.appendChild(toolbar);

      await ConflictDetector.scan();
      await ConflictDetector.scan();

      expect(document.querySelectorAll('#nextended-conflict-banner').length).toBe(1);
    });

    it('skips the banner for scripts already acknowledged in storage', async () => {
      await StorageManager.setConflictAck({ ackedAt: 12345, scripts: ['nnwpp-attrs'] });
      const tagged = document.createElement('div');
      tagged.setAttribute('data-nnwpp-enabled', 'true');
      document.body.appendChild(tagged);

      const state = await ConflictDetector.scan();

      expect(state.detected).toEqual(['nnwpp-attrs']);
      expect(state.unacknowledged).toEqual([]);
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();
    });

    it('dismissal persists the ack, hides the banner now and on future scans', async () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'allow-archive-downloads-wrapper';
      document.body.appendChild(wrapper);

      await ConflictDetector.scan();
      document.querySelector<HTMLButtonElement>('#nextended-conflict-banner button')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const ack = await StorageManager.getConflictAck();
      expect(ack.scripts).toContain('legacy-archive-wrapper');
      expect(ack.ackedAt).toBeGreaterThan(0);
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();

      const rescan = await ConflictDetector.scan();
      expect(rescan.unacknowledged).toEqual([]);
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();
    });

    it('warns again only for scripts not yet acknowledged', async () => {
      const toolbar = document.createElement('div');
      toolbar.className = 'bg-surface-low space-y-3 mt-4';
      document.body.appendChild(toolbar);

      await ConflictDetector.scan();
      document.querySelector<HTMLButtonElement>('#nextended-conflict-banner button')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();

      const tagged = document.createElement('div');
      tagged.setAttribute('data-nnwpp-enabled', 'true');
      document.body.appendChild(tagged);

      const state = await ConflictDetector.scan();

      expect(state.unacknowledged).toEqual(['nnwpp-attrs']);
      const bannerText = document.getElementById('nextended-conflict-banner')?.textContent || '';
      expect(bannerText).toContain(CONFLICT_SCRIPT_LABELS['nnwpp-attrs']);
      expect(bannerText).not.toContain(CONFLICT_SCRIPT_LABELS['ndc-toolbar']);
    });
  });

  describe('persisted state for the popup badge', () => {
    it('persists unacknowledged conflicts for the popup and clears them on ack', async () => {
      const tagged = document.createElement('div');
      tagged.setAttribute('data-nnwpp-download', '1');
      document.body.appendChild(tagged);

      await ConflictDetector.scan();
      const before = await StorageManager.getConflictState();
      expect(before.unacknowledged).toEqual(['nnwpp-attrs']);

      document.querySelector<HTMLButtonElement>('#nextended-conflict-banner button')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const after = await StorageManager.getConflictState();
      expect(after.unacknowledged).toEqual([]);
    });

    it('persists an empty state on a clean page', async () => {
      const state = await ConflictDetector.scan();

      expect(state.detected).toEqual([]);
      expect(state.unacknowledged).toEqual([]);
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();

      const persisted = await StorageManager.getConflictState();
      expect(persisted.unacknowledged).toEqual([]);
    });

    it('clears the banner and state once the foreign script is uninstalled', async () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'allow-archive-downloads-wrapper';
      document.body.appendChild(wrapper);

      await ConflictDetector.scan();
      expect(document.getElementById('nextended-conflict-banner')).not.toBeNull();

      wrapper.remove();
      const state = await ConflictDetector.scan();

      expect(state.detected).toEqual([]);
      expect(document.getElementById('nextended-conflict-banner')).toBeNull();
    });
  });
});
