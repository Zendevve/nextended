// src/content/modules/collection/selectModal.ts — selection modal for "custom" runType.
// Search + sort + shift-click range select + live count.

import type { QueueItem } from "../../../core/types.js";

export interface SelectionResult {
  keys: string[];
}

export function openSelectionModal(items: readonly QueueItem[]): Promise<SelectionResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const card = document.createElement("div");
    card.className = "nx-panel";
    card.style.width = "min(900px, 92vw)";
    card.style.maxHeight = "80vh";
    card.style.overflow = "auto";
    overlay.appendChild(card);

    const title = document.createElement("h2");
    title.textContent = "Select mods to download";
    card.appendChild(title);

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search…";
    search.style.width = "100%";
    card.appendChild(search);

    const controls = document.createElement("div");
    controls.className = "nx-row";
    controls.style.margin = "6px 0";
    const sortKey = document.createElement("select");
    for (const v of ["mod", "file", "size"]) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sortKey.appendChild(opt);
    }
    const sortDir = document.createElement("select");
    for (const v of ["asc", "desc"]) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sortDir.appendChild(opt);
    }
    controls.appendChild(sortKey);
    controls.appendChild(sortDir);
    card.appendChild(controls);

    const list = document.createElement("div");
    list.style.maxHeight = "50vh";
    list.style.overflow = "auto";
    card.appendChild(list);

    const count = document.createElement("div");
    count.className = "nx-muted";
    card.appendChild(count);

    const actions = document.createElement("div");
    actions.className = "nx-row";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "nx-btn nx-btn-primary";
    ok.textContent = "Start";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "nx-btn";
    cancel.textContent = "Cancel";
    actions.appendChild(ok);
    actions.appendChild(cancel);
    card.appendChild(actions);

    const selected = new Set<string>();
    const state: { anchor: string | null } = { anchor: null };

    function renderList(filter: string): void {
      list.replaceChildren();
      const visible = items
        .filter((i) =>
          (i.modName + " " + i.fileName).toLowerCase().includes(filter.toLowerCase()),
        )
        .slice()
        .sort((a, b) => {
          const dir = sortDir.value === "asc" ? 1 : -1;
          const key = sortKey.value;
          if (key === "mod") return a.modName.localeCompare(b.modName) * dir;
          if (key === "file") return a.fileName.localeCompare(b.fileName) * dir;
          return (a.sizeKB - b.sizeKB) * dir;
        });
      for (const it of visible) {
        const row = document.createElement("label");
        row.className = "nx-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(it.key);
        cb.addEventListener("click", (ev) => {
          if (ev.shiftKey && state.anchor) {
            const idxA = visible.findIndex((v) => v.key === state.anchor);
            const idxB = visible.findIndex((v) => v.key === it.key);
            const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
            const shouldSelect = !selected.has(it.key);
            for (let i = lo; i <= hi; i++) {
              const k = visible[i]?.key;
              if (k) {
                if (shouldSelect) selected.add(k);
                else selected.delete(k);
              }
            }
          } else {
            if (selected.has(it.key)) selected.delete(it.key);
            else selected.add(it.key);
            state.anchor = it.key;
          }
          updateCount();
          renderList(search.value);
        });
        row.appendChild(cb);
        const span = document.createElement("span");
        span.textContent = `${it.modName} — ${it.fileName} (${(it.sizeKB / 1024).toFixed(1)} MB)`;
        row.appendChild(span);
        list.appendChild(row);
      }
      updateCount();
    }

    function updateCount(): void {
      count.textContent = `${selected.size} of ${items.length} selected`;
    }

    search.addEventListener("input", () => renderList(search.value));
    sortKey.addEventListener("change", () => renderList(search.value));
    sortDir.addEventListener("change", () => renderList(search.value));

    ok.addEventListener("click", () => {
      overlay.remove();
      resolve({ keys: [...selected] });
    });
    cancel.addEventListener("click", () => {
      overlay.remove();
      resolve({ keys: [] });
    });

    document.body.appendChild(overlay);
    renderList("");
  });
}
