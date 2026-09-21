---
status: accepted
---

# Reimplement from behavior; never copy from the replaced userscripts

nextended exists to render three userscripts irrelevant: Nexus Download Collection (no
license — all rights reserved by default), Nexus No Wait ++ (GPL-3.0-or-later), and
Nexusmods Allow archive downloads (CC BY-NC-SA). Their sources were studied as
behavioral references only. We decided that nextended contains no copied code and no
verbatim-copied selectors, regexes, or query strings — every fragment is reimplemented
from documented public behavior — so nextended remains proprietary under its
all-rights-reserved license.

## Considered Options

- **Copy with attribution** — rejected: GPL/NC-SA contamination of a proprietary codebase
  is effectively irreversible.
- **Strict clean-room (never read the sources)** — rejected: the sources were already
  studied before this decision; pretending otherwise would be provenance theater. The
  boundary we can actually enforce is "no copied artifacts," not "unseen sources."

## Consequences

When a userscript solves something cleverly, transcribe the *behavior* into fresh code;
never paste. Endpoint shapes and protocol constants that Nexus itself defines (e.g. the
GenerateDownloadUrl form fields) are public interface facts, not copied expression, and
are fine to use.
