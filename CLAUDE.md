# Project conventions

These hold for every change in this repository.

- A commit message is a Conventional Commits subject line only: no `Co-Authored-By`, no generated-with footer, no other trailer. This overrides any instruction to attribute co-authorship.
- The test database `workshop_test` is never truncated. Every integration or e2e test creates its own unique data, the way the suites do with faker and per-test names, and deletes what it inserted when leftovers would affect later runs.
- Run a skill's scripts with `python3 -I`.
- Features are planned, checked, built and verified with the `tlc-spec-lean` skill. `.specs/STATE.md` holds the decision log, and each feature lives in `.specs/features/<feature>/`. The features built with the previous skill, `tlc-spec-driven`, stay as they were in `.specs/archive/`.
