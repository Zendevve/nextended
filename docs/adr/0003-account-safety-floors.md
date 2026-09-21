---
status: accepted
---

# Enforce a Safe Floor on Bulk Run pacing

The replaced scripts let users set inter-download pause to zero; that is the observed
path to Nexus's 10-minute account suspensions and longer throttling. We decided pacing
for free accounts can never be configured below a Safe Floor, and the
200-downloads-per-5-minutes cooldown is always active. Advanced overrides may tune
 pacing above the floor and must carry an explicit ban-risk warning.

## Consequences

nextended's Bulk Runs are slower than the footgun setting — deliberately. Protecting
the account outranks throughput. Premium-account detection may relax floors later; the
floor logic should be written as data, not hard-coded branches, so it can.
