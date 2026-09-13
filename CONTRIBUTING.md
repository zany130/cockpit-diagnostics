# Contributing to cockpit-diagnostics

Thank you for working on this Cockpit diagnostics plugin. Keep changes inside the existing v1.0 product scope unless a follow-up explicitly opens post-1.0 work.

## Prerequisites

- Node.js 18 or later
- `make`, `git`, and `gettext`
- A systemd/Cockpit host for real-host checks (the fixture preview is not a substitute)

## Build

```bash
make
```

`make` fetches the pinned Cockpit `pkg/lib` sources, installs npm dependencies, and writes `dist/`.

Development install (symlink only; not for production):

```bash
make devel-install
```

Remove that symlink with `make devel-uninstall`.

Fixture-backed preview:

```bash
npm run preview
```

## Tests

```bash
npm run typecheck
npm run eslint
npm run stylelint
npm test
```

Cockpit browser tests need bots/VM images:

```bash
make check
```

Typical environment: `TEST_OS=centos-9-stream` (Makefile default). That target is not available in every development environment.

## Architecture boundaries

Keep this layering:

```text
Cockpit/system interfaces
        ↓
provider
        ↓
parser / normalizer / detector
        ↓
typed domain model
        ↓
React UI
```

- React components must not parse raw command output.
- Providers must not contain presentation logic.
- Parsers and detectors must stay independently testable.
- Raw systemd/journal/coredump schemas must not leak through the UI.
- Run commands with argv arrays through `runCommand` / `cockpit.spawn()`. Do not use `sh -c`, `bash -c`, or string-built shells.
- Jump to Cockpit pages only through `src/utils/cockpitLinks.ts`.

See `IMPLEMENTATION.md` for the architectural contract.

## Fixtures

Sanitize captured command output before committing it:

- no personal usernames where avoidable
- no private IP addresses
- no unsanitized serials or host-specific secrets
- no real coredump file contents

Prefer small, purpose-built fixtures over dumping a whole host journal.

## Scope

Do not add new top-level pages, a daemon, a database, telemetry, unit editing, or automatic remediation in drive-by changes.

If you discover a useful feature, document it under **Post-1.0 / Future Work** in `IMPLEMENTATION.md` rather than implementing it here.

## Real-host testing

Changes that touch spawn behavior, boot-ID parsing, Cockpit routes, plot SVG, journal queries, or packaging should be retested on a systemd PID 1 host with Cockpit. Follow `docs/manual-test-matrix.md`.
