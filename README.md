# nextended ⚡

**nextended** is a high-performance Manifest V3 browser extension that unifies three essential Nexus Mods enhancement tools into a single, seamless, cross-browser suite:

1. **Nexus Download Collection (NDC)**: Automated batch and collection downloader via Nexus GraphQL with revision diffing, mod selection modals, local file matching, safety rate-limiting, and live progress console.
2. **Nexus No Wait ++ (NNWPP)**: Instant single-click downloads (skips 5-second countdown), automatic requirements modal/tab bypass, Shadow DOM click capture, Cloudflare/VPN challenge fallback, and automated tab closure.
3. **Allow Archive Downloads**: Restores and injects functional "Mod manager download" and "Manual download" buttons for archived/disabled file listings (`?tab=files&category=archived`).

---

## 🚀 Features

- **⚡ Zero-Wait Single Downloads**: Bypasses countdown timers and requirement popups on mod pages to immediately trigger direct NXM (Vortex / MO2) or browser downloads.
- **📦 Collections Bulk Downloader**:
  - Direct GraphQL queries to fetch all collection files and metadata.
  - Download all mods, mandatory only, optional only, or custom selections.
  - Live progress bar with Pause, Resume, Stop, Skip Pause, and Skip to Index controls.
  - **Revision Diffing**: Inspect differences between collection revisions (Added, Updated, Removed) and download only changes.
  - **Local File Matcher**: Scan a folder of downloaded mods to automatically skip existing files.
- **🛡️ Rate-Limit & Cooldown Protection**:
  - Dynamically calculates pause durations based on mod file size and connection speed.
  - Enforces a 5-minute safety cooldown after 200 downloads to prevent Nexus 10-minute temporary account suspensions.
- **📂 Archive File Unlocks**: Automatically injects download buttons into archived mod tables where downloads were previously hidden or disabled.
- **⚙️ Configurable Options & Popup**: Quick toggles for auto-start, auto-close delay, requirements bypass, and download speeds.

---

## 📥 Installation

### Load Unpacked Extension (Developer Mode)

1. Clone or download this repository.
2. Install dependencies and build the extension:
   ```bash
   npm install
   npm run build
   ```
3. Open your browser's extensions page:
   - **Chrome / Brave / Edge**: Navigate to `chrome://extensions/`
   - **Firefox**: Navigate to `about:debugging#/runtime/this-firefox`
4. Enable **Developer mode** (top-right toggle in Chromium browsers).
5. Click **Load unpacked** and select the `dist/` folder generated inside this directory.

---

## 🛠️ Development & Testing

```bash
# Run unit tests with Vitest
npm test

# Build production bundle
npm run build
```

---

## ☕ Support

If you find this extension helpful, you can support development here:

👉 **[buymeacoffee.com/zendevve](https://buymeacoffee.com/zendevve)**

---

## 📄 License

See [LICENSE](LICENSE) for full copyright notice and limited personal use terms.
