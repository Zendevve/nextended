/**
 * Universal cross-browser WebExtension API abstraction.
 * Works seamlessly in Chromium MV3 and Firefox MV3.
 */

const hasBrowser = typeof globalThis.browser !== 'undefined' && globalThis.browser !== null;
const hasChrome = typeof globalThis.chrome !== 'undefined' && globalThis.chrome !== null;

export const extensionApi = hasBrowser ? globalThis.browser : hasChrome ? globalThis.chrome : {};

export function getRuntime() {
  return extensionApi.runtime || null;
}

export function getStorage(area = 'local') {
  if (extensionApi.storage && extensionApi.storage[area]) {
    return extensionApi.storage[area];
  }
  return null;
}

export function getDownloads() {
  return extensionApi.downloads || null;
}

export function getTabs() {
  return extensionApi.tabs || null;
}

export function getNotifications() {
  return extensionApi.notifications || null;
}
