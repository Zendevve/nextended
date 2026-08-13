export function parseFileId(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^-?\d+$/.test(s)) return s;
  const m = s.match(/(\d+)/);
  return m ? m[1] : null;
}

export function parseFileIdFromElement(element) {
  if (!element) return null;
  if (typeof element.getAttribute === 'function') {
    const id =
      element.getAttribute('data-id') ||
      element.getAttribute('data-file-id') ||
      element.getAttribute('data-fileid') ||
      element.getAttribute('data-object-id');
    if (id) return parseFileId(id);
  }
  if (typeof element.getAttribute === 'function') {
    const href = element.getAttribute('href') || element.getAttribute('data-href') || '';
    if (href) {
      const fromQuery = href.match(/[?&](?:file_id|fileId)=(\d+)/);
      if (fromQuery) return fromQuery[1];
      const fromPath = href.match(/\/files\/(\d+)/);
      if (fromPath) return fromPath[1];
    }
  }
  const id = element.id;
  if (id) return parseFileId(id);
  return null;
}

export function parseFileName(element) {
  if (!element) return 'archived-file';
  const selectors = [
    '.file-link',
    '.filename',
    '.file-name',
    '[data-field="Filename"]',
    'a.fileLink',
  ];
  for (const sel of selectors) {
    const el = element.querySelector && element.querySelector(sel);
    if (el && el.textContent) return el.textContent.trim();
  }
  const text = element.textContent && element.textContent.trim();
  return text || 'archived-file';
}

export function parseFileIdsFromString(str) {
  if (typeof str !== 'string') return [];
  const ids = new Set();
  const re = /(\d{4,})/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    ids.add(m[1]);
  }
  return [...ids];
}
