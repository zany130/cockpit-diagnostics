# cockpit-diagnostics

A Cockpit application that presents systemd boot, unit, crash, current-boot findings, and systemd service sandboxing analysis without replacing Cockpit Services or Logs.

v0.4 answers:

- How long did this boot take, by phase?
- Which units spent the longest in the activating state?
- Which units appear on systemd's critical boot path?
- Which units are currently failed?
- Which coredumps were recorded for the current boot?
- Was there out-of-memory kill activity on this boot?
- Were there high-priority kernel events on this boot?
- How strongly do loaded system services use systemd sandboxing settings, according to `systemd-analyze security`?

It does **not** invent a health score, restart services, store history, browse the journal, debug cores, scan for CVEs, or change unit hardening. Cockpit Logs remains the place to inspect raw journal evidence. Cockpit Services remains the place to start, stop, or edit units.

The Security page reports systemd's own exposure/assessment for service configuration. A high exposure value does not prove a service is vulnerable. A low exposure value does not prove a service is safe.

## Requirements

- A systemd-based Linux host with Cockpit
- Node.js 18+ and `make` to build from source
- `gettext` for translations
- `coredumpctl` for the Crashes page (optional)
- `journalctl` for the Findings page (optional)
- `systemd-analyze security` with `--json=short` for the Security page (optional; Boot, Crashes, and Findings still work without it)

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

This repository can serve a fixture-backed preview of the Overview, Boot, Crashes, Findings, and Security pages. It is not a substitute for running the plugin inside Cockpit, and it does not talk to a live systemd instance.

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
npm run stylelint
```

Parser and detector tests use captured `systemd-analyze`, `systemctl`, `coredumpctl`, sanitized `journalctl --output=json`, and `systemd-analyze --json=short security` fixtures. Browser integration tests (`make check`) need Cockpit's test VM images.

## Command and parsing rules

- Commands run through `cockpit.spawn()` with argv arrays, never shell strings.
- Text-producing commands set `LC_ALL=C`, disable colors, and disable the pager.
- Capability detection probes `systemd-analyze`, `systemctl`, `coredumpctl`, and `journalctl`. The security page is enabled only when `systemd-analyze --help` lists `security [UNIT...]`. Plot and verify are not probed.
- `systemd-analyze time`, `blame`, and `critical-chain` have no documented JSON output, so they are parsed from locale-stable text.
- Failed units prefer systemd D-Bus `ListUnitsFiltered`, then `systemctl list-units --state=failed --plain`.
- Coredumps prefer `coredumpctl --json=short list` plus a `_BOOT_ID=` match for the current boot. `coredumpctl` has no `--boot` option.
- Findings use bounded `journalctl --output=json` queries for the current boot only. Detectors interpret normalized entries; the UI does not browse the journal.
- Security uses `systemd-analyze --system --no-pager --json=short security` once per Security page load or refresh, then the same command with one unit name for per-setting details. Overview does not run this analysis. Unit names are separate argv entries.
- Providers fail independently. A missing `journalctl` or `systemd-analyze security` does not hide boot timing, failed units, or coredumps.

## Known limitations

- `systemd-analyze blame` measures activation duration, not boot delay. Units start in parallel.
- `systemd-analyze critical-chain` is an estimate. Socket activation, skipped activating states, and timed-out jobs are not fully represented.
- This host must be booted with systemd as PID 1 for live data.
- Ordinary users typically see only journal data they can read. Diagnostics does not auto-escalate.
- `coredumpctl list` with no matches exits non-zero (`No coredumps found.`); the UI treats that as an empty list.
- `journalctl --grep` exits 1 when nothing matches; Findings treats that as an empty result for that query.
- `systemd-analyze security` without unit names inspects every loaded long-running system `.service`. That can take several seconds on a busy host, so the page snapshots once and does not poll.
- `--offline` is not used. That mode reviews unit files through a private manager, not the live system instance.
- User-manager (`--user`) security analysis is out of scope for v0.4.
- v0.4 does not include a journal browser, CVE scanning, automatic hardening, boot history, GDB, core download, core deletion, `systemd-analyze plot`, or `systemd-analyze verify`.

See `IMPLEMENTATION.md` for the architectural contract.
