# Add a Message Type

Recipe for adding a new message type. All types are `NXDT_*` string constants declared in one place and routed in one of two ways. This guide uses a hypothetical example, `NXDT_FETCH_COLLECTION_REVISIONS`-style request `NXDT_CHECK_MOD_UPDATES`, to keep the steps concrete — it is an example only, not a planned feature.

## 1. Declare the type

Add an entry to `MESSAGE_TYPES` in `src/shared/constants.js`:

```js
export const MESSAGE_TYPES = {
  PING: 'NXDT_PING',
  // ...
  CHECK_MOD_UPDATES: 'NXDT_CHECK_MOD_UPDATES',
};
```

`src/shared/messages.js` exports `MESSAGE_TYPES` and `MessageFactory` helpers (`ping`, `getSettings`, `settingsChanged`) built on `createMessage(type, payload)`. A factory helper is optional; the constant is the contract.

## 2. Choose the route

Two routes exist; pick by who must act on the message:

**Service worker (SW)-handled** — for anything that needs `chrome.downloads`, network calls, or shared state. Register a handler in `registerHandlers()` in `src/background/handlers.js`:

```js
export function registerHandlers(deps = {}) {
  registerHandler(MESSAGE_TYPES.CHECK_MOD_UPDATES, async (payload, sender) => {
    return { updates: await checkModUpdates(payload) };
  });
  // ...
}
```

`registerHandlers` is called from `src/background/service-worker.js` during `init()` with the deps `{ getCollectionClient, refreshClients }`. The plumbing is:

- `message-router.js` — `registerHandler(type, handler)` stores the handler; `dispatch(message, sender)` looks it up and wraps the result in the response envelope.
- `service-worker.js` — the `chrome.runtime.onMessage` listener validates the sender, calls `dispatch(message, sender)`, and sends the envelope back.

`GET_SETTINGS` and `PING` are registered directly in `message-router.js`; every other SW-handled type is registered in `handlers.js`. Keep new types in `registerHandlers` unless the handler belongs in the router.

**Popup → content script only** — for a request that acts on the page DOM and needs no SW involvement. Register a `chrome.runtime.onMessage` listener in the content script, `src/content/nexus-content.js`, following the `NXDT_FOCUS_COLLECTION_PANEL` pattern:

```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === MESSAGE_TYPES.FOCUS_COLLECTION_PANEL) {
    const panel = document.querySelector(COLLECTION_PANEL_SELECTOR);
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // ...
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  }
  return false;
});
```

The popup sends this with `chrome.tabs.sendMessage(id, { type: NXDT_FOCUS_COLLECTION_PANEL })` and reads the `{ ok: boolean }` reply. `return false` signals a synchronous response.

## 3. Envelope contract

Requests are always `{ type, payload }` — `payload` defaults to `{}` in `createMessage` and the collection-ui wrapper.

The SW dispatch wraps every handler result:

- Success: `{ success: true, result }`
- Failure: `{ success: false, error, code }`

Return the result object from the handler; `dispatch` wraps it. Throw a `NexusDownloadError(ERROR_CODES.X, 'message')` (from `src/shared/errors.js`) for typed failures — `dispatch` catches it and maps `error`/`code` into the failure envelope. Raw throws become `{ success: false, error: <message>, code: undefined }`.

Content-script-only listeners are exempt: they respond with a simple shape (`{ ok: true }`), read directly by the popup.

## 4. Sender validation

Every SW message is gated in `service-worker.js` before dispatch:

```js
if (!isTrustedSender(sender, chrome.runtime.id)) {
  sendResponse({ success: false, error: 'Untrusted sender', code: ERROR_CODES.INVALID_INPUT });
  return false;
}
```

`isTrustedSender(sender, runtimeId)` (in `src/background/handlers.js`) accepts only senders with `sender.id === chrome.runtime.id` whose `sender.url` is either a `chrome-extension://<id>` page or `https://www.nexusmods.com`. Your new SW-handled type inherits this automatically — no per-type checks needed, and any handler that acts on payload data can assume the payload came from an extension page or the Nexus site. A content-script-only listener needs no sender check: it only exists inside our own content script.

## 5. Call site

Call SW-handled types through the wrapper in `src/content/collection-ui.js` — the same pattern `CollectionManager` uses:

```js
function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (res && res.success === false) {
          const err = new Error(res.error || 'Request failed');
          err.code = res.code;
          return reject(err);
        }
        resolve(res && res.result !== undefined ? res.result : res);
      });
    } catch (e) {
      reject(e);
    }
  });
}
```

Usage:

```js
const { updates } = await sendMessage(MESSAGE_TYPES.CHECK_MOD_UPDATES, {
  gameDomain: 'skyrimspecialedition',
  collectionSlug: 'mycollection',
});
// failures reject with Error carrying .code (an ERROR_CODES value)
```

The wrapper rejects on `success: false` and resolves `result`; error handling at the call site is try/catch on the rejected `Error`, using `err.code` to branch.

## 6. Test

Two patterns exist, both mocking `chrome.runtime.sendMessage` (or `chrome.storage`) on `globalThis.chrome` via `vi.fn`:

- **Handler tests** — `tests/background/handlers.test.js`: `makeChromeMock()` provides in-memory `storage.local` and `downloads`; `beforeEach` installs it and calls `handlers.resetHistoryCache()`. Call the exported handler directly and assert the envelope:

```js
it('returns updates for a trusted payload', async () => {
  const res = await handlers.checkModUpdates({ gameDomain: 'skyrimspecialedition' });
  expect(res).toEqual({ updates: expect.any(Array) });
});
```

- **Wrapper tests** — `tests/collection-ui.test.js`: `mockSendMessage(handler)` replaces `chrome.runtime.sendMessage` with a `vi.fn` that calls the callback and resolves; it also exports `ok(result)` and `fail(error, code)` helpers to build envelopes. Drive the code path, then assert both the payload passed to `sendMessage` and the value resolved:

```js
const sendMessage = mockSendMessage(() => ok({ updates: [] }));
await manager.refreshMods();
expect(sendMessage).toHaveBeenCalledWith(
  { type: MESSAGE_TYPES.CHECK_MOD_UPDATES, payload: { gameDomain: 'skyrimspecialedition' } },
  expect.any(Function)
);
```

For the collection-ui queue tests, drain promise microtasks with the local `flushUntil(condition)` helper after triggering a message.

## 7. Run the targeted suite

```bash
npx vitest run tests/background/handlers.test.js
npx vitest run tests/collection-ui.test.js
```

Both files must stay green; run the full suite (`npm run test`) before finishing.

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)
- [Architecture](../reference/architecture.md)
- [Message protocol](../reference/message-protocol.md)
- [Settings and storage](../reference/settings-and-storage.md)
- [Errors](../reference/errors.md)
- [Permissions](../reference/permissions.md)
- [Security model](../reference/security-model.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
