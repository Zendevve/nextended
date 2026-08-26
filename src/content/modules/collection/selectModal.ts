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
    overlay.style.background = "rgba(0, 0, 0, 0.75)";
    overlay.style.backdropFilter = "blur(3px)";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "20px";
    overlay.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // Shadow DOM to isolate styles completely from host page
    const shadowHost = document.createElement("div");
    overlay.appendChild(shadowHost);
    const shadow = shadowHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .modal-card {
        background: #18191c;
        color: #e6e6e6;
        border: 1px solid #32353b;
        border-radius: 8px;
        width: min(780px, 94vw);
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
        font-family: inherit;
        font-size: 13px;
        line-height: 1.4;
      }
      .modal-header {
        padding: 16px 20px;
        border-bottom: 1px solid #2d3036;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .modal-header h2 {
        font-size: 16px;
        font-weight: 600;
        color: #f3f3f3;
      }
      .modal-controls {
        padding: 12px 20px;
        display: flex;
        gap: 10px;
        background: #1f2024;
        border-bottom: 1px solid #2d3036;
      }
      .search-input {
        flex: 1;
        background: #121315;
        border: 1px solid #3c4048;
        border-radius: 4px;
        color: #f0f0f0;
        padding: 6px 12px;
        font-size: 13px;
        outline: none;
      }
      .search-input:focus {
        border-color: #da8e35;
      }
      .select-input {
        background: #121315;
        border: 1px solid #3c4048;
        border-radius: 4px;
        color: #f0f0f0;
        padding: 6px 10px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
      }
      .quick-actions {
        padding: 8px 20px;
        display: flex;
        gap: 12px;
        font-size: 12px;
        background: #1a1b1e;
        border-bottom: 1px solid #282a2e;
      }
      .quick-link {
        color: #da8e35;
        cursor: pointer;
        text-decoration: underline;
        background: none;
        border: none;
        font-size: 12px;
        font-family: inherit;
        padding: 0;
      }
      .quick-link:hover {
        color: #f5aa54;
      }
      .modal-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
        max-height: 48vh;
      }
      .item-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 20px;
        cursor: pointer;
        user-select: none;
        transition: background 0.1s ease;
      }
      .item-row:hover {
        background: #23252a;
      }
      .item-row input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: #da8e35;
      }
      .item-info {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        overflow: hidden;
      }
      .item-title {
        font-weight: 500;
        color: #e1e3e6;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .item-sub {
        font-size: 12px;
        color: #9297a0;
        white-space: nowrap;
      }
      .modal-footer {
        padding: 14px 20px;
        border-top: 1px solid #2d3036;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #18191c;
        border-radius: 0 0 8px 8px;
      }
      .count-badge {
        font-size: 13px;
        color: #9ea3ab;
      }
      .btn-group {
        display: flex;
        gap: 8px;
      }
      .btn {
        padding: 6px 16px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid transparent;
        font-family: inherit;
        transition: background 0.15s ease;
      }
      .btn-secondary {
        background: #282a2f;
        color: #ddd;
        border-color: #383c44;
      }
      .btn-secondary:hover {
        background: #34373d;
      }
      .btn-primary {
        background: #da8e35;
        color: #111;
        font-weight: 600;
      }
      .btn-primary:hover {
        background: #ea9d43;
      }
    `;
    shadow.appendChild(style);

    const card = document.createElement("div");
    card.className = "modal-card";
    shadow.appendChild(card);

    // Header
    const header = document.createElement("div");
    header.className = "modal-header";
    const title = document.createElement("h2");
    title.textContent = "Select Mods to Download";
    header.appendChild(title);
    card.appendChild(header);

    // Controls (Search + Sort)
    const controls = document.createElement("div");
    controls.className = "modal-controls";

    const search = document.createElement("input");
    search.type = "search";
    search.className = "search-input";
    search.placeholder = "Filter by mod name or filename…";
    controls.appendChild(search);

    const sortKey = document.createElement("select");
    sortKey.className = "select-input";
    sortKey.innerHTML = `
      <option value="mod">Sort by Mod Name</option>
      <option value="file">Sort by Filename</option>
      <option value="size">Sort by Size</option>
    `;
    controls.appendChild(sortKey);

    const sortDir = document.createElement("select");
    sortDir.className = "select-input";
    sortDir.innerHTML = `
      <option value="asc">Ascending</option>
      <option value="desc">Descending</option>
    `;
    controls.appendChild(sortDir);
    card.appendChild(controls);

    // Quick Actions
    const quick = document.createElement("div");
    quick.className = "quick-actions";
    const selectAllBtn = document.createElement("button");
    selectAllBtn.className = "quick-link";
    selectAllBtn.textContent = "Select All";
    const deselectAllBtn = document.createElement("button");
    deselectAllBtn.className = "quick-link";
    deselectAllBtn.textContent = "Deselect All";
    quick.appendChild(selectAllBtn);
    quick.appendChild(deselectAllBtn);
    card.appendChild(quick);

    // Mod List
    const list = document.createElement("div");
    list.className = "modal-list";
    card.appendChild(list);

    // Footer
    const footer = document.createElement("div");
    footer.className = "modal-footer";
    const count = document.createElement("div");
    count.className = "count-badge";
    footer.appendChild(count);

    const btnGroup = document.createElement("div");
    btnGroup.className = "btn-group";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-secondary";
    cancel.textContent = "Cancel";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn-primary";
    ok.textContent = "Start Download";
    btnGroup.appendChild(cancel);
    btnGroup.appendChild(ok);
    footer.appendChild(btnGroup);
    card.appendChild(footer);

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
        row.className = "item-row";

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

        const info = document.createElement("div");
        info.className = "item-info";

        const titleSpan = document.createElement("span");
        titleSpan.className = "item-title";
        titleSpan.textContent = it.modName;
        titleSpan.title = it.modName;

        const subSpan = document.createElement("span");
        subSpan.className = "item-sub";
        const sizeStr = (it.sizeKB / 1024).toFixed(1);
        subSpan.textContent = `${it.fileName} (${sizeStr} MB)`;

        info.appendChild(titleSpan);
        info.appendChild(subSpan);
        row.appendChild(info);

        list.appendChild(row);
      }
      updateCount();
    }

    function updateCount(): void {
      count.textContent = `${selected.size} of ${items.length} mods selected`;
    }

    selectAllBtn.addEventListener("click", () => {
      for (const item of items) selected.add(item.key);
      updateCount();
      renderList(search.value);
    });

    deselectAllBtn.addEventListener("click", () => {
      selected.clear();
      updateCount();
      renderList(search.value);
    });

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

    // Close on overlay click outside card
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve({ keys: [] });
      }
    });

    document.body.appendChild(overlay);
    renderList("");
  });
}
