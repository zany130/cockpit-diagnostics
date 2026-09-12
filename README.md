# cockpit-diagnostics

A Cockpit application that presents systemd boot and unit diagnostics without replacing Cockpit Services or Logs.

v0.1 answers:

- How long did this boot take, by phase?
- Which units spent the longest in the activating state?
- Which units appear on systemd's critical boot path?
- Which units are currently failed?

It does **not** invent a health score, restart services, store history, or browse the journal.

## Requirements

- A systemd-based Linux host with Cockpit
- Node.js 18+ and `make` to build from source
- `gettext` for translations

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

This repository can serve a fixture-backed preview of the Overview and Boot pages. It is not a substitute for running the plugin inside Cockpit, and it does not talk to a live systemd instance.

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

Parser tests use captured `systemd-analyze` and `systemctl` output. Browser integration tests (`make check`) need Cockpit's test VM images.

## Command and parsing rules

- Commands run through `cockpit.spawn()` with argv arrays, never shell strings.
- Text-producing commands set `LC_ALL=C`.
- `systemd-analyze time`, `blame`, and `critical-chain` have no documented JSON output, so they are parsed from locale-stable text.
- Failed units prefer systemd D-Bus `ListUnitsFiltered`, then `systemctl list-units --state=failed --plain`.
- Providers fail independently. A missing `systemd-analyze` does not hide failed units.

## Known limitations

- `systemd-analyze blame` measures activation duration, not boot delay. Units start in parallel.
- `systemd-analyze critical-chain` is an estimate. Socket activation, skipped activating states, and timed-out jobs are not fully represented.
- This host must be booted with systemd as PID 1 for live data.
- v0.1 does not include coredumps, journal diagnostics, `systemd-analyze security`, or boot history.

See `IMPLEMENTATION.md` for the architectural contract.
