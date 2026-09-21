# nextended

A power suite for Nexus Mods users: collection bulk downloads, instant single-file
downloads, and access to archived files — without degrading the site itself. Exists to
replace three userscripts (Nexus Download Collection, Nexus No Wait ++, Nexusmods Allow
archive downloads) with one clean-room extension.

## Language

### Nexus concepts

**Collection**:
A curated, versioned list of mod files published on Nexus Mods under one game.
_Avoid_: modlist, mod pack

**Revision**:
A numbered snapshot of a Collection's file list. Comparing two Revisions yields
added, updated, and removed files.
_Avoid_: version (reserved for individual file versions)

**Mandatory File**:
A file a Collection author requires. **Optional File**: one offered as an extra.

**Archived File**:
An older mod file hidden from the normal files tab but still obtainable through the
same download endpoints when requested directly.

**Requirements Gate**:
Nexus's demand that listed dependencies be acknowledged (as a dialog or a tab) before a
download proceeds.
_Avoid_: requirements popup (the dialog is only one surface of the gate)

### Download flows

**Single Download**:
Turning one file click (or `file_id` URL) into a real download with no countdown and no
Requirements Gate.

**Bulk Run**:
An automated, paced sequence of Single Downloads over a selection of Collection files,
with history-based skipping and pause/stop control.
_Avoid_: batch download, mass download

**Browser Download**:
The file is saved by the browser's own downloader. The first-class method; works for
everyone.
_Avoid_: manual download (ambiguous with "clicking things by hand")

**Vortex Handoff**:
Delegating a download to an external mod manager via the `nxm://` protocol. Opt-in,
with failure detection.

### Policies

**Do-No-Harm Contract**:
The four-clause promise that nextended leaves Nexus pages untouched unless a feature is
actively invoked (ADR-0002).

**Clean Room** (project sense):
No copied code and no verbatim-copied selectors, regexes, or query strings from the
replaced userscripts — behavior only, reimplemented fresh (ADR-0001).

**Replacement Posture**:
nextended assumes the replaced userscripts are uninstalled. It does not engineer
coexistence with them.

**Conflict Marker**:
A DOM side-effect that betrays a known userscript still being installed (injected
buttons, toolbar nodes, stylesheet hooks).

**Safe Floor**:
The minimum pacing between downloads that nextended enforces on free accounts to stay
clear of Nexus rate-limit suspensions. User overrides cannot go below it (ADR-0003).
