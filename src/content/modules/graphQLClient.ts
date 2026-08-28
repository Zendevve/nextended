import { ENDPOINTS } from '../../common/endpoints';
import { CollectionModFile, CollectionRevisionMetadata, CollectionRevisionData } from '../../common/types';
import { Logger } from '../../common/logger';

export class GraphQLClient {
  private static gameIdCache = new Map<string, string>();

  static async fetchGameId(domainName: string): Promise<string | null> {
    if (!domainName) return null;
    const cached = this.gameIdCache.get(domainName);
    if (cached) return cached;

    try {
      const response = await fetch(ENDPOINTS.GRAPHQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: `query GameByDomain ($domainName: String!) {
            game (domainName: $domainName) {
              id
              domainName
            }
          }`,
          variables: { domainName },
          operationName: 'GameByDomain'
        })
      });

      if (!response.ok) return null;
      const json = await response.json();
      const gid = json?.data?.game?.id;
      if (gid) {
        const idStr = String(gid);
        this.gameIdCache.set(domainName, idStr);
        return idStr;
      }
      return null;
    } catch (err) {
      Logger.error('GraphQL fetchGameId error:', err);
      return null;
    }
  }

  static clearGameIdCache(): void {
    this.gameIdCache.clear();
  }

  static setCachedGameId(domainName: string, id: string): void {
    if (domainName && id) this.gameIdCache.set(domainName, id);
  }
  static async fetchPrimaryModFileId(domainName: string, modId: number): Promise<string | null> {
    if (!domainName || !modId) return null;
    try {
      const response = await fetch(ENDPOINTS.GRAPHQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: `query ModPrimaryFile ($gameDomain: String!, $modId: Int!) {
            mod (gameDomain: $gameDomain, modId: $modId) {
              modFiles {
                fileId
                categoryName
                isPrimary
              }
            }
          }`,
          variables: { gameDomain: domainName, modId },
          operationName: 'ModPrimaryFile'
        })
      });
      if (!response.ok) return null;
      const json = await response.json();
      const files = json?.data?.mod?.modFiles;
      if (!Array.isArray(files) || files.length === 0) return null;
      const primary =
        files.find((f: { isPrimary?: boolean; categoryName?: string }) => f.isPrimary || f.categoryName === 'MAIN') ||
        files[0];
      return primary?.fileId ? String(primary.fileId) : null;
    } catch (err) {
      Logger.error('GraphQL fetchPrimaryModFileId error:', err);
      return null;
    }
  }


  static async fetchCollectionMods(slug: string, revision: number | null = null): Promise<CollectionRevisionData | null> {
    try {
      const response = await fetch(ENDPOINTS.GRAPHQL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `query CollectionRevisionMods ($revision: Int, $slug: String!, $viewAdultContent: Boolean) {
            collectionRevision (revision: $revision, slug: $slug, viewAdultContent: $viewAdultContent) {
              externalResources { id, name, resourceType, resourceUrl }
              modFiles {
                fileId
                optional
                file {
                  fileId
                  name
                  uri
                  size
                  version
                  date
                  mod {
                    adult
                    modId
                    name
                    version
                    game { domainName, id }
                  }
                }
              }
            }
          }`,
          variables: { slug, viewAdultContent: true, revision },
          operationName: 'CollectionRevisionMods'
        })
      });

      if (!response.ok) {
        Logger.error('GraphQL fetchCollectionMods non-OK status:', response.status);
        return null;
      }

      const json = await response.json();
      const rev = json?.data?.collectionRevision;
      if (!rev || !rev.modFiles) return null;

      rev.modFiles = rev.modFiles.map((modFile: CollectionModFile) => {
        modFile.file.url = `https://www.nexusmods.com/${modFile.file.mod.game.domainName}/mods/${modFile.file.mod.modId}?tab=files&file_id=${modFile.file.fileId}`;
        return modFile;
      });

      return rev;
    } catch (err) {
      Logger.error('GraphQL fetchCollectionMods error:', err);
      return null;
    }
  }

  static async fetchCollectionRevisions(domainName: string, slug: string): Promise<CollectionRevisionMetadata[] | null> {
    try {
      const response = await fetch(ENDPOINTS.GRAPHQL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `query CollectionRevisions ($domainName: String, $slug: String!) {
            collection (domainName: $domainName, slug: $slug) {
              revisions {
                adultContent
                createdAt
                discardedAt
                id
                revisionNumber
                revisionStatus
                totalSize
                modCount
              }
            }
          }`,
          variables: { domainName, slug },
          operationName: 'CollectionRevisions'
        })
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.collection?.revisions || null;
    } catch (err) {
      Logger.error('GraphQL fetchCollectionRevisions error:', err);
      return null;
    }
  }
}
