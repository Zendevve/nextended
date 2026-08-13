// Centralized DOM selectors for content scripts.
// Fallback arrays are ordered: the first matching element wins.

export const FILES_TAB_FOOTER_SELECTOR = '#files-tab-footer';
export const FILE_EXPANDER_HEADER_SELECTOR = '.file-expander-header';
export const ACCORDION_DOWNLOADS_SELECTOR = '.accordion-downloads';
export const FLEX_LABEL_SELECTOR = '.flex-label';
export const ARCHIVE_BTN_LABEL_SELECTOR = 'a.btn.inline-flex .flex-label';

// Elements injected by this extension (data-nxdt-* markers for cleanup).
export const ARCHIVED_ENTRY_BTN_SELECTOR = '[data-nxdt-archived-btn]';
export const ARCHIVED_DL_BTN_SELECTOR = '[data-nxdt-archived-dl]';
export const FORCE_MANAGER_BTN_SELECTOR = '[data-nxdt-force-manager]';

// Slow download button: custom element with shadow root first, then legacy
// fallback buttons.
export const SLOW_DOWNLOAD_HOST_SELECTOR = 'mod-file-download';
export const SLOW_DOWNLOAD_SHADOW_BTN_SELECTOR = 'button';
export const SLOW_DOWNLOAD_BUTTON_SELECTORS = [
  '#slowDownloadButton',
  '.btn-slow-download',
];

// Force-mod-manager candidate links (matched as a selector list).
export const FORCE_MANAGER_LINK_SELECTORS = [
  'a[href*="file_id="]:not([href*="nmm=1"])',
  'a.btn[href*="tab=files"]:not([href*="nmm=1"])',
];
export const SIBLING_ACTION_SELECTOR = 'a, button';

// Collection page container fallback chain (ordered).
export const MAIN_CONTENT_SELECTORS = [
  '#mainContent > div > div.relative > div.next-container',
  '#mainContent',
  '.collection-header',
  '.collection-view',
  'main',
  '#content',
];
export const COLLECTION_PANEL_SELECTOR = '[data-nxdt-collection]';
export const MODAL_OVERLAY_SELECTOR = '.nxdt-modal-overlay';

export function querySlowDownloadButton(root = document) {
  const host = root.querySelector(SLOW_DOWNLOAD_HOST_SELECTOR);
  const inShadow = host?.shadowRoot?.querySelector(SLOW_DOWNLOAD_SHADOW_BTN_SELECTOR);
  if (inShadow) return inShadow;
  for (const selector of SLOW_DOWNLOAD_BUTTON_SELECTORS) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function queryFirst(root, selectors, fallback = null) {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return fallback;
}
