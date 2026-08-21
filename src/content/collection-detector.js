export function extractCollectionDetails(pathname = window.location.pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);

  // Legacy:  /games/{gameDomain}/collections/{collectionSlug}
  // Current: /{gameDomain}/collections/{collectionSlug}
  // Optional revision tail: .../revisions/{revisionNumber}
  const legacy = parts.length >= 4 && parts[0] === 'games' && parts[2] === 'collections';
  const current = parts.length >= 3 && parts[1] === 'collections';

  let gameDomain;
  let collectionSlug;
  let revisionIndex;
  if (legacy) {
    gameDomain = parts[1];
    collectionSlug = parts[3];
    revisionIndex = 4;
  } else if (current) {
    gameDomain = parts[0];
    collectionSlug = parts[2];
    revisionIndex = 3;
  } else {
    return null;
  }

  let revisionNumber = null;
  if (parts.length >= revisionIndex + 2 && parts[revisionIndex] === 'revisions') {
    const parsed = parseInt(parts[revisionIndex + 1], 10);
    if (!isNaN(parsed)) {
      revisionNumber = parsed;
    }
  }

  return { gameDomain, collectionSlug, revisionNumber };
}
