---
'@danibram/crap4ts': patch
---

`crap4ts init --workflow` now exits 2 when `.github/workflows/crap.yml` already exists and `--force` was not passed. The previous behaviour was to warn and exit 0, which silently kept the user's old workflow — exactly the kind of surprise that bites later when CI doesn't match the freshly-published template. The config file (`crap.config.json`) was already handled this way; this aligns the workflow path with that contract.

If you scripted around `init` expecting a successful exit when a workflow file existed, add `--force` to overwrite it, or check for the file before running `init`.
