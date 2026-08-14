import { ERROR_CODES, NexusDownloadError } from '../shared/errors.js';

const getGlobalFetch = () =>
  typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : typeof fetch === 'function'
      ? fetch.bind(globalThis)
      : null;

export class CollectionClient {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || getGlobalFetch();
    this.graphqlEndpoint = options.graphqlEndpoint || 'https://api-router.nexusmods.com/graphql';
    this.timeout = options.timeout || 30000;
  }

  _controller() {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeout);
    return { signal: ac.signal, cancel: () => clearTimeout(timer) };
  }

  async fetchRevisions(gameDomain, collectionSlug) {
    if (!this.fetchImpl) {
      throw new NexusDownloadError(
        ERROR_CODES.NETWORK_ERROR,
        'Fetch API unavailable in this context'
      );
    }
    const query = `query CollectionRevisions ($domainName: String, $slug: String!) {
      collection (domainName: $domainName, slug: $slug) {
        revisions {
          adultContent
          createdAt
          discardedAt
          id
          latest
          revisionNumber
          revisionStatus
          totalSize
          modCount
          collectionChangelog { description, id }
          gameVersions { reference }
        }
      }
    }`;
    const variables = { domainName: gameDomain, slug: collectionSlug };

    const data = await this._postGraphql(query, variables, 'CollectionRevisions');
    if (!data?.collection?.revisions) {
      return [];
    }
    return data.collection.revisions;
  }

  async fetchMods(gameDomain, collectionSlug, revision = null) {
    if (!this.fetchImpl) {
      throw new NexusDownloadError(
        ERROR_CODES.NETWORK_ERROR,
        'Fetch API unavailable in this context'
      );
    }
    const query = `query CollectionRevisionMods ($revision: Int, $slug: String!, $viewAdultContent: Boolean) {
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
    }`;
    const variables = { slug: collectionSlug, viewAdultContent: true, revision };

    const data = await this._postGraphql(query, variables, 'CollectionRevisionMods');
    if (!data?.collectionRevision) {
      return null;
    }

    const revisionData = data.collectionRevision;
    if (Array.isArray(revisionData.modFiles)) {
      revisionData.modFiles = revisionData.modFiles.map((modFile) => {
        if (modFile.file && modFile.file.mod && modFile.file.mod.game) {
          const domain = modFile.file.mod.game.domainName;
          const modId = modFile.file.mod.modId;
          const fileId = modFile.file.fileId;
          modFile.file.url = `https://www.nexusmods.com/${domain}/mods/${modId}?tab=files&file_id=${fileId}`;
        }
        return modFile;
      });
    }

    return revisionData;
  }

  async fetchModRequirements(gameDomain, modId) {
    if (!this.fetchImpl) {
      throw new NexusDownloadError(
        ERROR_CODES.NETWORK_ERROR,
        'Fetch API unavailable in this context'
      );
    }
    const query = `query ModDetails ($domainName: String, $modId: Int!) {
      mod (domainName: $domainName, modId: $modId) {
        name
        summary
        version
        adult
        game { domainName, id }
      }
    }`;
    const variables = { domainName: gameDomain, modId: Number(modId) };
    const data = await this._postGraphql(query, variables, 'ModDetails').catch(() => null);
    return data?.mod || null;
  }

  async _postGraphql(query, variables, operationName) {
    const { signal, cancel } = this._controller();
    try {
      const response = await this.fetchImpl(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        mode: 'cors',
        credentials: 'include',
        signal,
        body: JSON.stringify({ query, variables, operationName }),
      });

      if (!response.ok) {
        throw new NexusDownloadError(
          ERROR_CODES.NETWORK_ERROR,
          `GraphQL request failed with status ${response.status}`
        );
      }

      const json = await response.json();
      if (json.errors && json.errors.length > 0) {
        throw new NexusDownloadError(
          ERROR_CODES.INVALID_RESPONSE,
          json.errors[0]?.message || 'GraphQL error'
        );
      }
      return json.data || null;
    } catch (err) {
      if (err instanceof NexusDownloadError) throw err;
      if (err && err.name === 'AbortError') {
        throw new NexusDownloadError(ERROR_CODES.TIMEOUT, 'GraphQL request timed out');
      }
      throw new NexusDownloadError(
        ERROR_CODES.NETWORK_ERROR,
        err?.message || 'Network error during GraphQL fetch'
      );
    } finally {
      cancel();
    }
  }
}
