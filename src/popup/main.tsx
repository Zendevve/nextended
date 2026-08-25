import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { parseSettings, type Settings } from "../core/settings.js";
import type { BudgetState } from "../core/types.js";
import { send } from "../core/messages.js";

function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get("nextended.v1.settings", (raw) => {
      const obj = (raw as Record<string, unknown>)["nextended.v1.settings"];
      const parsed = parseSettings(obj);
      resolve(parsed ?? (parseSettings({}) as Settings));
    });
  });
}

function loadBudget(): Promise<BudgetState> {
  return new Promise((resolve) => {
    chrome.storage.local.get("nextended.v1.budget", (raw) => {
      const obj = (raw as Record<string, unknown>)["nextended.v1.budget"];
      if (
        obj &&
        typeof obj === "object" &&
        "launches" in obj &&
        "cooldownUntil" in obj
      ) {
        resolve(obj as BudgetState);
      } else {
        resolve({ launches: [], cooldownUntil: null });
      }
    });
  });
}

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [budget, setBudget] = useState<BudgetState | null>(null);

  const refreshBudget = async () => {
    const r = await send({ t: "budget:get" });
    if (r && "state" in r) setBudget(r.state);
  };

  useEffect(() => {
    void loadSettings().then(setSettings);
    void loadBudget().then(setBudget);
    void refreshBudget();
  }, []);

  const toggleDebug = () => {
    if (!settings) return;
    const next: Settings = { ...settings, debugMode: !settings.debugMode };
    setSettings(next);
    chrome.storage.local.set({ "nextended.v1.settings": next });
  };

  if (!settings || !budget) return <p>Loading…</p>;

  const recent = budget.launches.length;
  const cooldown = budget.cooldownUntil;
  const inCooldown = typeof cooldown === "number" && cooldown > Date.now();

  return (
    <main class="nextended-popup">
      <h1>nextended</h1>
      <p>
        Budget: <strong>{recent}</strong> launches in window.
        {inCooldown ? (
          <>
            {" "}
            <em>Cooldown active</em> until{" "}
            {new Date(cooldown as number).toLocaleTimeString()}.
          </>
        ) : null}
      </p>
      <p>
        Mode: <strong>{settings.downloadMode}</strong>
        {settings.debugMode ? " · debug on" : ""}
      </p>
      <p>
        <button type="button" onClick={refreshBudget}>
          Refresh
        </button>
        <button type="button" onClick={toggleDebug}>
          {settings.debugMode ? "Disable debug" : "Enable debug"}
        </button>
      </p>
      <p>
        <a href="../options/options.html" target="_blank" rel="noreferrer">
          Open options
        </a>
      </p>
    </main>
  );
}

const root = document.getElementById("root");
if (root) render(<App />, root);
