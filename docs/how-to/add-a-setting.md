# Add a Setting

Recipe for adding a new user-facing setting. This guide uses a hypothetical example, `maxConcurrentDownloads` (an integer, default `1`), to keep every step concrete. It is an example only — the extension's collection queue is serial, so do not wire a concurrency feature without also reworking the queue.

## 1. Add the key and default

Open `src/storage/defaults.js` and add the key to `DEFAULT_SETTINGS`. The default's type is the schema: `boolean`, `number`, or `string` — `settings.js` coerces stored values against it (step 2).

```js
export const DEFAULT_SETTINGS = {
  enabled: true,
  // ...
  requestTimeout: 30000,
  maxConcurrentDownloads: 1,
};
```

Do not touch `DEFAULT_STATS` unless the new key is a stat, and do not bump `STORAGE_VERSION` unless existing stored values need re-interpretation.

## 2. How stored values are merged and coerced

`src/storage/settings.js` is the single read/write path. Everything it stores lives under one key, `STORAGE_KEY_SETTINGS` (`'settings'`) in `chrome.storage.local`.

`getSettings()`:

1. Reads the stored blob; missing storage or a missing blob means defaults win.
2. Runs `coerceSettings(stored)`: iterates `DEFAULT_SETTINGS` entries and, per key, applies `coerceSetting(raw[key], fallback)`. Keys absent from the stored blob take the default; keys not in `DEFAULT_SETTINGS` are dropped.
3. Merges `{ ...DEFAULT_SETTINGS, ...coerceSettings(stored) }`.

Type coercion (`coerceSetting`) is driven by the default's type:

| Default type | Stored value handling |
|---|---|
| `boolean` | `!!value` (any truthy/falsy input coerces) |
| `number` | `Number(value)`; non-finite result falls back to the default |
| `string` | `String(value)`, unless `null`/`undefined` → default |

`STORAGE_VERSION` (currently `1`) is a schema stamp, not a value:

- If `stored.__version !== STORAGE_VERSION` — which includes the first run, when the stored blob has no `__version` — `getSettings()` re-merges against defaults, stamps `__version: STORAGE_VERSION`, persists the result, and returns it.
- If the version matches, the merged object is returned as-is.

`setSettings(settings)` always persists `{ ...DEFAULT_SETTINGS, __version: STORAGE_VERSION, ...settings }` — so writes are never partial and never skip the stamp. `updateSettings(patch)` is `getSettings()` then `setSettings({ ...current, ...patch })`; `resetSettings()` is `setSettings({ ...DEFAULT_SETTINGS })`.

## 3. Wire the options page

Add the input in `src/options/options.html`. The `name` attribute must equal the settings key; the control type should match the schema (checkbox for booleans, number for numbers, radio group for enums):

```html
<label>
  Max concurrent downloads
  <input type="number" name="maxConcurrentDownloads" min="1" max="10" />
</label>
```

Then in `src/options/options.js`:

1. Register the input in the `form` object:

```js
maxConcurrentDownloads: document.querySelector('input[name="maxConcurrentDownloads"]'),
```

2. Load it in `loadSettings()` with the matching helper — `boolInput` for checkboxes, `numInput` for numbers, `radioInput` for radio groups:

```js
numInput(form.maxConcurrentDownloads, 'maxConcurrentDownloads', settings);
```

3. Collect it in `collect()`:

```js
settings.maxConcurrentDownloads = numValue(form.maxConcurrentDownloads, DEFAULT_SETTINGS.maxConcurrentDownloads);
```

The helpers and the 0-preservation rule:

- `boolInput(input, name, settings)` sets `checked` from `settings[name]`, falling back to `DEFAULT_SETTINGS[name]`.
- `numInput(input, name, settings)` sets `input.value`.
- `radioInput(inputs, name, settings)` checks the radio whose `value` string-matches the setting.
- `numValue(input, fallback, useFloat = false)` parses the input: an empty string or a non-finite parse falls back to `fallback`; a valid `0` is kept. Never write `|| DEFAULT_SETTINGS.x` — that converts `0` into the default. Pass `useFloat = true` for fractional settings (as `collectionDownloadSpeed` does).

`save()` already persists the collected object and sends `NXDT_SETTINGS_CHANGED`; the reset button re-loads `DEFAULT_SETTINGS`. No further wiring is needed in `options.js`.

## 4. Consume the setting

The new key is now part of every `getSettings()` result. Where it is read depends on the consumer:

- **Content script** — `src/content/nexus-content.js` calls `getSettings()` in `init()` and stores the result in `currentSettings`, then passes it to `applyNoWaitFeatures(currentSettings)` and `processCollectionPage()`. Features read individual keys off that object. The script stays live by reacting to `chrome.storage.onChanged` for the `settings` key in `chrome.storage.local`: it merges `changes[STORAGE_KEY_SETTINGS].newValue` into `currentSettings` and re-applies features, so a changed value takes effect on an open Nexus page without a reload.
- **Popup** — `src/popup/popup.js` requests the merged settings from the service worker with an `NXDT_GET_SETTINGS` message inside `refresh()` and re-renders its rows; it also listens to `storage.onChanged`.
- **Service worker** — handlers read `await getSettings()` directly (e.g. `requestTimeout` in `resolveArchivedDownload`). The `NXDT_SETTINGS_CHANGED` message re-runs `refreshClients()`, which re-applies the logger level and request timeout live.

Any new setting that a feature gates must be checked where the feature runs — and, for content features, the onChanged merge must include the new key (the spread merge in `nexus-content.js` already does).

## 5. Test

Extend `tests/settings.test.js` with a default assertion:

```js
it('carries the maxConcurrentDownloads default', async () => {
  const s = await getSettings();
  expect(s.maxConcurrentDownloads).toBe(DEFAULT_SETTINGS.maxConcurrentDownloads);
});
```

Run the targeted suite:

```bash
npx vitest run tests/settings.test.js
```

Then, if you touched any `src/**/*.html`, run the full suite (`npm run test`) — `tests/html-assets.test.js` guards page references (see `../how-to/debug-and-verify.md`).

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a message type](../how-to/add-a-message-type.md)
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
