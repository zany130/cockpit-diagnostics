# cockpit-diagnostics

A Cockpit application that presents systemd boot, unit, and crash diagnostics without replacing Cockpit Services or Logs.

v0.2 answers:

- How long did this boot take, by phase?
- Which units spent the longest in the activating state?
- Which units appear on systemd's critical boot path?
- Which units are currently failed?
- Which coredumps were recorded for the current boot?

It does **not** invent a health score, restart services, store history, browse the journal, or debug cores.

## Requirements

- A systemd-based Linux host with Cockpit
- Node.js 18+ and `make` to build from source
- `gettext` for translations
- `coredumpctl` for the Crashes page (optional; the rest of Diagnostics still works without it)

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

This repository can serve a fixture-backed preview of the Overview, Boot, and Crashes pages. It is not a substitute for running the plugin inside Cockpit, and it does not talk to a live systemd instance.

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

Parser tests use captured `systemd-analyze`, `systemctl`, and `coredumpctl` output. Browser integration tests (`make check`) need Cockpit's test VM images.

## Command and parsing rules

- Commands run through `cockpit.spawn()` with argv arrays, never shell strings.
- Text-producing commands set `LC_ALL=C`, disable colors, and disable the pager.
- Capability detection probes `systemd-analyze`, `systemctl`, and `coredumpctl`.
- `systemd-analyze time`, `blame`, and `critical-chain` have no documented JSON output, so they are parsed from locale-stable text.
- Failed units prefer systemd D-Bus `ListUnitsFiltered`, then `systemctl list-units --state=failed --plain`.
- Coredumps prefer `coredumpctl --json=short list` plus a `_BOOT_ID=` match for the current boot. `coredumpctl` has no `--boot` option.
- `coredumpctl info` is still human-readable on current systemd, so detail metadata is parsed from locale-stable text.
- Providers fail independently. A missing `coredumpctl` does not hide boot timing or failed units.

## Known limitations

- `systemd-analyze blame` measures activation duration, not boot delay. Units start in parallel.
- `systemd-analyze critical-chain` is an estimate. Socket activation, skipped activating states, and timed-out jobs are not fully represented.
- This host must be booted with systemd as PID 1 for live data.
- Ordinary users typically see only their own coredumps. Listing system dumps usually needs journal access (`systemd-journal`/admin). Diagnostics does not auto-escalate.
- `coredumpctl list` with no matches exits non-zero (`No coredumps found.`); the UI treats that as an empty list.
- `coredumpctl info --json=` is not usable on systemd 257; JSON is requested only for `list`.
- v0.2 does not include journal diagnostics, `systemd-analyze security`, boot history, GDB, core download, or core deletion.

See `IMPLEMENTATION.md` for the architectural contract.
