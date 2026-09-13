# cockpit-diagnostics

A Cockpit application that presents systemd boot, unit, crash, and current-boot diagnostic findings without replacing Cockpit Services or Logs.

v0.3 answers:

- How long did this boot take, by phase?
- Which units spent the longest in the activating state?
- Which units appear on systemd's critical boot path?
- Which units are currently failed?
- Which coredumps were recorded for the current boot?
- Was there out-of-memory kill activity on this boot?
- Were there high-priority kernel events on this boot?

It does **not** invent a health score, restart services, store history, browse the journal, or debug cores. Cockpit Logs remains the place to inspect raw journal evidence.

## Requirements

- A systemd-based Linux host with Cockpit
- Node.js 18+ and `make` to build from source
- `gettext` for translations
- `coredumpctl` for the Crashes page (optional)
- `journalctl` for the Findings page (optional; Boot and Crashes still work without it)

## Build and install

```bash
make
make devel-install
```

`make` fetches Cockpit's shared `pkg/lib` sources, installs npm dependencies, and writes `dist/`. `make devel-install` links that directory into `~/.local/share/cockpit/diagnostics`. Reload Cockpit and open **Diagnostics**.

Production install:

```bash
make install
```

## Local UI preview without Cockpit

This repository can serve a fixture-backed preview of the Overview, Boot, Crashes, and Findings pages. It is not a substitute for running the plugin inside Cockpit, and it does not talk to a live systemd instance.

```bash
make
npm run preview
```

Then open `http://127.0.0.1:43127/`.

## Tests

```bash
npm run typecheck
npm test
npm run eslint
```

Parser and detector tests use captured `systemd-analyze`, `systemctl`, `coredumpctl`, and sanitized `journalctl --output=json` fixtures. Browser integration tests (`make check`) need Cockpit's test VM images.

## Command and parsing rules

- Commands run through `cockpit.spawn()` with argv arrays, never shell strings.
- Text-producing commands set `LC_ALL=C`, disable colors, and disable the pager.
- Capability detection probes `systemd-analyze`, `systemctl`, `coredumpctl`, and `journalctl`.
- `systemd-analyze time`, `blame`, and `critical-chain` have no documented JSON output, so they are parsed from locale-stable text.
- Failed units prefer systemd D-Bus `ListUnitsFiltered`, then `systemctl list-units --state=failed --plain`.
- Coredumps prefer `coredumpctl --json=short list` plus a `_BOOT_ID=` match for the current boot. `coredumpctl` has no `--boot` option.
- Findings use bounded `journalctl --output=json` queries for the current boot only. Detectors interpret normalized entries; the UI does not browse the journal.
- Providers fail independently. A missing `journalctl` does not hide boot timing, failed units, or coredumps.

## Known limitations

- `systemd-analyze blame` measures activation duration, not boot delay. Units start in parallel.
- `systemd-analyze critical-chain` is an estimate. Socket activation, skipped activating states, and timed-out jobs are not fully represented.
- This host must be booted with systemd as PID 1 for live data.
- Ordinary users typically see only journal data they can read. Diagnostics does not auto-escalate.
- `coredumpctl list` with no matches exits non-zero (`No coredumps found.`); the UI treats that as an empty list.
- `journalctl --grep` exits 1 when nothing matches; Findings treats that as an empty result for that query.
- v0.3 does not include a journal browser, `systemd-analyze security`, boot history, GDB, core download, or core deletion.

See `IMPLEMENTATION.md` for the architectural contract.
