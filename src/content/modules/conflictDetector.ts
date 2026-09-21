import { StorageManager } from '../../common/storage';
import { Logger } from '../../common/logger';
import { ConflictScriptId, ConflictDetectionState, CONFLICT_SCRIPT_LABELS } from '../../common/types';

/**
 * ConflictDetector — Replacement Posture (issue #13).
 *
 * Scans the page for Conflict Markers left behind by the userscripts nextended
 * replaces and warns the user once per script until they acknowledge the
 * banner. It never tries to coexist with or neutralize the foreign script:
 * the banner just tells the user to uninstall it.
 *
 * Foreign markers (reimplemented from observed behavior, ADR-0001):
 *  1. NDC toolbar mount: a `div` combining bg-surface-low + space-y-3 + mt-4
 *     appended to the collection page's main content. nextended's own
 *     collection container uses the same utility classes, so own mounts are
 *     excluded by selector, not by class list.
 *  2. Any attribute in the foreign `data-nnwpp-` namespace.
 *  3. The legacy archive wrapper class `.allow-archive-downloads-wrapper`
 *     (foreign-only since our injector moved to `.nextended-archive-actions`).
 */
export class ConflictDetector {
  private static readonly BANNER_ID = 'nextended-conflict-banner';
  private static readonly BANNER_TEXT_ID = 'nextended-conflict-banner-text';

  /** nextended-owned mounts: elements at or inside these never count as foreign markers. */
  private static readonly OWN_MOUNT_SELECTOR =
    '#nextended-collection-container, .nextended-archive-actions, #nextended-conflict-banner';

  /** Scan once on route settle; persists detection state for the popup badge. */
  static async scan(): Promise<ConflictDetectionState> {
    const detected = this.findForeignMarkers();
    const ack = await StorageManager.getConflictAck();
    const unacknowledged = detected.filter((id) => !ack.scripts.includes(id));
    const state: ConflictDetectionState = {
      detected,
      unacknowledged,
      updatedAt: Date.now()
    };
    await StorageManager.setConflictState(state);

    if (unacknowledged.length > 0) {
      Logger.warn(
        'ConflictDetector: replaced userscript(s) still installed:',
        unacknowledged.map((id) => CONFLICT_SCRIPT_LABELS[id]).join(', ')
      );
      this.showBanner(unacknowledged);
    } else {
      this.hideBanner();
    }
    return state;
  }

  /** Acknowledge every script the banner currently lists; hides it for this and future scans. */
  static async dismiss(): Promise<void> {
    const [ack, state] = await Promise.all([
      StorageManager.getConflictAck(),
      StorageManager.getConflictState()
    ]);
    const scripts = Array.from(new Set([...ack.scripts, ...state.unacknowledged]));
    await StorageManager.setConflictAck({ ackedAt: Date.now(), scripts });

    // Refresh the persisted state so the popup badge clears immediately.
    const detected = this.findForeignMarkers();
    await StorageManager.setConflictState({
      detected,
      unacknowledged: detected.filter((id) => !scripts.includes(id)),
      updatedAt: Date.now()
    });

    this.hideBanner();
    Logger.info('ConflictDetector: conflicts acknowledged by user');
  }

  private static findForeignMarkers(): ConflictScriptId[] {
    const found = new Set<ConflictScriptId>();

    // 1. NDC toolbar signature: container div with the userscript's distinctive class combo
    if (
      Array.from(document.querySelectorAll('div.bg-surface-low.space-y-3.mt-4')).some(
        (el) => !el.closest(this.OWN_MOUNT_SELECTOR)
      )
    ) {
      found.add('ndc-toolbar');
    }

    // 2. Foreign data-nnwpp-* attribute namespace (nextended's own attrs are data-nextended-*)
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el.closest(this.OWN_MOUNT_SELECTOR)) continue;
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('data-nnwpp-')) {
          found.add('nnwpp-attrs');
          break;
        }
      }
      if (found.has('nnwpp-attrs')) break;
    }

    // 3. Legacy archive wrapper class, unambiguously foreign after the marker rename
    if (
      Array.from(document.querySelectorAll('.allow-archive-downloads-wrapper')).some(
        (el) => !el.closest(this.OWN_MOUNT_SELECTOR)
      )
    ) {
      found.add('legacy-archive-wrapper');
    }

    return Array.from(found);
  }

  private static showBanner(scripts: ConflictScriptId[]): void {
    if (!document.body) return;

    let banner = document.getElementById(this.BANNER_ID);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = this.BANNER_ID;
      banner.className = 'nextended-conflict-banner';
      banner.setAttribute('data-nextended-conflict-banner', '1');
      banner.setAttribute('role', 'alert');
      banner.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'right: 0',
        'z-index: 999998',
        'display: flex',
        'align-items: center',
        'gap: 10px',
        'box-sizing: border-box',
        'padding: 10px 16px',
        'background: #3a2a14',
        'color: #f5e9dc',
        'border-bottom: 2px solid #da8e35',
        'font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ].join(';');

      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'flex: none; font-size: 15px; color: #da8e35;';
      icon.textContent = '⚠';

      const text = document.createElement('span');
      text.id = this.BANNER_TEXT_ID;
      text.style.cssText = 'flex: 1;';

      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.style.cssText = [
        'flex: none',
        'padding: 4px 12px',
        'border: none',
        'border-radius: 4px',
        'background: #da8e35',
        'color: #ffffff',
        'font: 600 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'text-transform: uppercase',
        'cursor: pointer'
      ].join(';');
      dismissBtn.addEventListener('click', () => {
        void ConflictDetector.dismiss();
      });

      banner.append(icon, text, dismissBtn);
      document.body.prepend(banner);
    }

    const names = scripts.map((id) => CONFLICT_SCRIPT_LABELS[id]).join(', ');
    const textEl = document.getElementById(this.BANNER_TEXT_ID);
    if (textEl) {
      textEl.textContent = `nextended: a replaced userscript is still installed (${names}) — uninstall it; nextended replaces it.`;
    }
  }

  private static hideBanner(): void {
    document.getElementById(this.BANNER_ID)?.remove();
  }
}
