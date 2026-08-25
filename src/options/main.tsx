import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  parseSettings,
  SettingsSchema,
  type Settings,
} from "../core/settings.js";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; settings: Settings }
  | { status: "error"; message: string };

function load(): Promise<Settings> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get("nextended.v1.settings", (raw) => {
      const obj = (raw as Record<string, unknown>)["nextended.v1.settings"];
      const parsed = parseSettings(obj);
      if (parsed) resolve(parsed);
      else reject(new Error("Stored settings are corrupt."));
    });
  });
}

function save(settings: Settings): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ "nextended.v1.settings": settings }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function exportSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2);
}

function importSettings(text: string): Settings | null {
  try {
    const obj = JSON.parse(text) as unknown;
    return parseSettings(obj);
  } catch {
    return null;
  }
}

interface FieldProps {
  label: string;
  hint?: string;
  children: preact.ComponentChildren;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label class="nextended-field">
      <span class="nextended-field-label">{label}</span>
      {children}
      {hint ? <small class="nextended-field-hint">{hint}</small> : null}
    </label>
  );
}

function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [importText, setImportText] = useState("");

  useEffect(() => {
    load()
      .then((settings) => setState({ status: "loaded", settings }))
      .catch((err: unknown) =>
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, []);

  if (state.status === "loading") return <p>Loading…</p>;
  if (state.status === "error") {
    return (
      <section>
        <h1>nextended — Options</h1>
        <p role="alert">Error loading settings: {state.message}</p>
        <button
          type="button"
          onClick={() => setState({ status: "loaded", settings: DEFAULT_SETTINGS })}
        >
          Reset to defaults
        </button>
      </section>
    );
  }

  const update = (patch: Partial<Settings>) => {
    const next = applySettingsPatch(state.settings, patch);
    if (!next) return;
    setState({ status: "loaded", settings: next });
    void save(next);
  };

  return (
    <main>
      <h1>nextended — Options</h1>

      <section>
        <h2>General</h2>
        <Field label="Download mode">
          <select
            value={state.settings.downloadMode}
            onChange={(e) =>
              update({
                downloadMode: (e.currentTarget as HTMLSelectElement)
                  .value as Settings["downloadMode"],
              })
            }
          >
            <option value="vortex">Vortex (nxm://)</option>
            <option value="browser">Browser (chrome.downloads)</option>
          </select>
        </Field>
        <Field label="Debug mode" hint="Structured console logging of every event.">
          <input
            type="checkbox"
            checked={state.settings.debugMode}
            onChange={(e) =>
              update({ debugMode: (e.currentTarget as HTMLInputElement).checked })
            }
          />
        </Field>
      </section>

      <section>
        <h2>Collections</h2>
        <Field label="Assumed speed (MB/s)">
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={state.settings.assumedSpeedMBps}
            onInput={(e) =>
              update({
                assumedSpeedMBps: Number(
                  (e.currentTarget as HTMLInputElement).value,
                ),
              })
            }
          />
        </Field>
        <Field label="Extra pause per file (seconds)">
          <input
            type="number"
            min={0}
            step={1}
            value={state.settings.extraPauseSeconds}
            onInput={(e) =>
              update({
                extraPauseSeconds: Number(
                  (e.currentTarget as HTMLInputElement).value,
                ),
              })
            }
          />
        </Field>
        <Field label="Prompt before skipping downloaded files">
          <input
            type="checkbox"
            checked={state.settings.skipDownloadedPrompt}
            onChange={(e) =>
              update({
                skipDownloadedPrompt: (e.currentTarget as HTMLInputElement)
                  .checked,
              })
            }
          />
        </Field>
      </section>

      <section>
        <h2>Single downloads</h2>
        <Field label="Auto-start on file_id= URLs">
          <input
            type="checkbox"
            checked={state.settings.autoStartOnFileId}
            onChange={(e) =>
              update({
                autoStartOnFileId: (e.currentTarget as HTMLInputElement).checked,
              })
            }
          />
        </Field>
        <Field label="Skip requirements popup" hint="D10: default off. Power users only.">
          <input
            type="checkbox"
            checked={state.settings.skipRequirements}
            onChange={(e) =>
              update({
                skipRequirements: (e.currentTarget as HTMLInputElement).checked,
              })
            }
          />
        </Field>
        <Field label="Auto-close tab after launch" hint="D11: default off.">
          <input
            type="checkbox"
            checked={state.settings.autoCloseTab}
            onChange={(e) =>
              update({
                autoCloseTab: (e.currentTarget as HTMLInputElement).checked,
              })
            }
          />
        </Field>
        <Field label="Tab close delay (ms)" hint="Minimum 500ms.">
          <input
            type="number"
            min={500}
            step={100}
            value={state.settings.closeTabDelayMs}
            onInput={(e) =>
              update({
                closeTabDelayMs: Number(
                  (e.currentTarget as HTMLInputElement).value,
                ),
              })
            }
          />
        </Field>
        <Field label="Colour-tint buttons while busy">
          <input
            type="checkbox"
            checked={state.settings.buttonColorFeedback}
            onChange={(e) =>
              update({
                buttonColorFeedback: (e.currentTarget as HTMLInputElement)
                  .checked,
              })
            }
          />
        </Field>
      </section>

      <section>
        <h2>Archived files</h2>
        <Field label="Inject Manual + Mod-manager buttons">
          <input
            type="checkbox"
            checked={state.settings.archivedButtons}
            onChange={(e) =>
              update({
                archivedButtons: (e.currentTarget as HTMLInputElement).checked,
              })
            }
          />
        </Field>
      </section>

      <section>
        <h2>Advanced</h2>
        <Field label="Budget window (launches)">
          <input
            type="number"
            min={1}
            step={1}
            value={state.settings.budgetWindowLaunches}
            onInput={(e) =>
              update({
                budgetWindowLaunches: Number(
                  (e.currentTarget as HTMLInputElement).value,
                ),
              })
            }
          />
        </Field>
        <Field label="Cooldown (ms)">
          <input
            type="number"
            min={0}
            step={1000}
            value={state.settings.budgetCooldownMs}
            onInput={(e) =>
              update({
                budgetCooldownMs: Number(
                  (e.currentTarget as HTMLInputElement).value,
                ),
              })
            }
          />
        </Field>
        <Field label="Dedupe TTL (hours, 0 disables)">
          <input
            type="number"
            min={0}
            step={1}
            value={state.settings.dedupeTtlHours}
            onInput={(e) =>
              update({
                dedupeTtlHours: Number(
                  (e.currentTarget as HTMLInputElement).value,
                ),
              })
            }
          />
        </Field>
        <Field label="Request timeout (ms)">
          <input
            type="number"
            min={1000}
            step={1000}
            value={state.settings.requestTimeoutMs}
            onInput={(e) =>
              update({
                requestTimeoutMs: Number(
                  (e.currentTarget as HTMLInputElement).value,
                ),
              })
            }
          />
        </Field>
      </section>

      <section>
        <h2>Import / Export</h2>
        <p>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([exportSettings(state.settings)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "nextended-settings.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export
          </button>
        </p>
        <textarea
          rows={6}
          value={importText}
          onInput={(e) =>
            setImportText((e.currentTarget as HTMLTextAreaElement).value)
          }
        />
        <p>
          <button
            type="button"
            onClick={() => {
              const next = importSettings(importText);
              if (next) {
                setState({ status: "loaded", settings: next });
                void save(next);
                setImportText("");
              } else {
                alert("Invalid settings JSON.");
              }
            }}
          >
            Import
          </button>
        </p>
      </section>

      <section>
        <h2>Schema</h2>
        <details>
          <summary>View default settings</summary>
          <pre>{JSON.stringify(SettingsSchema.parse({}), null, 2)}</pre>
        </details>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (root) render(<App />, root);
