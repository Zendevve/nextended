export function extractCollectionDetails(pathname = window.location.pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  // Match: /games/{gameDomain}/collections/{collectionSlug}
  // Optional: .../revisions/{revisionNumber}
  if (parts.length >= 4 && parts[0] === 'games' && parts[2] === 'collections') {
    const gameDomain = parts[1];
    const collectionSlug = parts[3];
    let revisionNumber = null;
    if (parts.length >= 6 && parts[4] === 'revisions') {
      const parsed = parseInt(parts[5], 10);
      if (!isNaN(parsed)) {
        revisionNumber = parsed;
      }
    }
    return { gameDomain, collectionSlug, revisionNumber };
  }
  return null;
}
