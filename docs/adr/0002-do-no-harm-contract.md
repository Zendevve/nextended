---
status: accepted
---

# The Do-No-Harm Contract

The extension's value depends on Nexus pages staying fully functional in the user's own
authenticated session; ambient interference is the fastest way to break the site and to
draw countermeasures. We adopted four clauses as a standing contract:

1. Zero visible change to Nexus UI unless a nextended feature is explicitly invoked.
2. All downloads go through the same authenticated endpoints a manual user click would
   hit.
3. The page shield stubs only what nextended's own flows require, suppresses only errors
   those stubs cause, and is opt-out.
4. Any click nextended cannot fully resolve yields to native Nexus behavior.

## Consequences

Features that alter the page (archive buttons, forced mod-manager buttons, the
collection toolbar) must be opt-in or explicitly user-invoked — they are features, not
ambient behavior. A regression against any clause is a bug, not a style preference.
