import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphQLClient } from '../../src/content/modules/graphQLClient';
import { StorageManager } from '../../src/common/storage';
import { Logger } from '../../src/common/logger';

describe('GraphQLClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses CollectionRevisionMods response correctly', async () => {
    const mockGraphQLResponse = {
      data: {
        collectionRevision: {
          externalResources: [],
          modFiles: [
            {
              fileId: 101,
              optional: false,
              file: {
                fileId: 101,
                name: 'Mod File 1',
                uri: 'Mod1.zip',
                size: 512,
                version: '1.0',
                date: 1234,
                mod: {
                  modId: 50,
                  name: 'Mod 50',
                  version: '1.0',
                  adult: false,
                  game: { domainName: 'skyrim', id: 1 }
                }
              }
            }
          ]
        }
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGraphQLResponse
    } as Response);

    const result = await GraphQLClient.fetchCollectionMods('my-collection', 1);

    expect(result).not.toBeNull();
    expect(result?.modFiles.length).toBe(1);
    expect(result?.modFiles[0].file.url).toContain('https://www.nexusmods.com/skyrim/mods/50?tab=files&file_id=101');
  });
});

describe('GraphQLClient request timeout enforcement (issue #12)', () => {
  let receivedSignal: AbortSignal | undefined;

  const hangUntilAborted = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      receivedSignal = init?.signal ?? undefined;
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      );
    });

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    GraphQLClient.clearGameIdCache();
    receivedSignal = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('aborts a stalled fetch at the configured timeout and surfaces it through the error path', async () => {
    vi.useFakeTimers();
    await StorageManager.setConfig({ requestTimeoutMs: 5000 });
    globalThis.fetch = vi.fn().mockImplementation(hangUntilAborted);
    const loggerError = vi.spyOn(Logger, 'error').mockImplementation(() => {});

    const pending = GraphQLClient.fetchCollectionMods('stalled-collection', 2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(receivedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toBeNull();
    expect(receivedSignal?.aborted).toBe(true);
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith('GraphQL fetchCollectionMods error:', expect.any(DOMException));
  });

  it('applies the default 30000ms timeout when the config omits requestTimeoutMs', async () => {
    vi.useFakeTimers();
    // localStorage cleared in beforeEach: getConfig() merges DEFAULT_CONFIG only.
    globalThis.fetch = vi.fn().mockImplementation(hangUntilAborted);
    vi.spyOn(Logger, 'error').mockImplementation(() => {});

    const pending = GraphQLClient.fetchCollectionMods('default-timeout-collection', null);
    await vi.advanceTimersByTimeAsync(29999);
    expect(receivedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toBeNull();
    expect(receivedSignal?.aborted).toBe(true);
  });
});
