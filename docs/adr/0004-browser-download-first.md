---
status: accepted
---

# Browser Download is the first-class download method

Collections heritage (Nexus Download Collection) defaults every bulk run to Vortex via
`nxm://` handoff, but protocol-handler misconfiguration is the number-one
troubleshooting item across the replaced scripts' user feedback, and some browsers
(e.g. Opera GX) break the handoff outright. We decided Browser Download is the primary
method everywhere — single files and Bulk Runs alike — and Vortex Handoff is an opt-in
per-user toggle with protocol-handler failure detection and a clear fallback message.

## Consequences

Fallback chains default to Browser Download; Vortex paths never gate the default
experience. Browser-specific `nxm://` breakage (Opera GX) is explicitly out of scope —
with Browser Download first-class it no longer blocks anyone.
