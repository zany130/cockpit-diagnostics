# cockpit-diagnostics

A Cockpit application that presents systemd boot, unit, crash, current-boot findings, systemd service sandboxing analysis, and unit-file verification without replacing Cockpit Services or Logs.

v0.5 answers:

- How long did this boot take, by phase?
- What did this boot look like as systemd's own timeline (`systemd-analyze plot`)?
- Which units spent the longest in the activating state?
- Which units appear on systemd's critical boot path?
- Which units are currently failed?
- Which coredumps were recorded for the current boot?
- Was there out-of-memory kill activity on this boot?
- Were there high-priority kernel events on this boot?
- How strongly do loaded system services use systemd sandboxing settings, according to `systemd-analyze security`?
- What warnings or errors does `systemd-analyze verify` report for an installed unit file?

It does **not** invent a health score, restart services, store history, browse the journal, debug cores, scan for CVEs, edit units, or change unit hardening. Cockpit Logs remains the place to inspect raw journal evidence. Cockpit Services remains the place to start, stop, or edit units.

The Security page reports systemd's own exposure/assessment for service configuration. A high exposure value does not prove a service is vulnerable. A low exposure value does not prove a service is safe.

The Verification page reports systemd's own unit-file findings. An empty result does not prove the unit will start. Findings can mention related units, not only the unit you selected.

## Requirements

- A systemd-based Linux host with Cockpit
- Node.js 18+ and `make` to build from source
- `gettext` for translations
- `coredumpctl` for the Crashes page (optional)
- `journalctl` for the Findings page (optional)
- `systemd-analyze security` with `--json=short` for the Security page (optional)
- `systemd-analyze plot` for the Boot timeline (optional; other Boot views still work)
- `systemd-analyze verify` for the Verification page (optional)

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

This repository can serve a fixture-backed preview of the Overview, Boot, Crashes, Findings, Security, and Verification pages. It is not a substitute for running the plugin inside Cockpit, and it does not talk to a live systemd instance.

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

Parser and detector tests use captured `systemd-analyze`, `systemctl`, `coredumpctl`, sanitized `journalctl --output=json`, `systemd-analyze --json=short security`, `systemd-analyze plot` SVG, and `systemd-analyze verify` fixtures. Browser integration tests (`make check`) need Cockpit's test VM images.

## Command and parsing rules

- Commands run through `cockpit.spawn()` with argv arrays, never shell strings.
- Text-producing commands set `LC_ALL=C`, disable colors, and disable the pager.
- Capability detection probes `systemd-analyze --help` / `--version`, `systemctl`, `coredumpctl`, and `journalctl`. Plot, verify, and security are enabled only when that help text lists the matching subcommand. The plugin does not spawn `plot`, `verify`, or `security` during capability detection.
- `systemd-analyze time`, `blame`, and `critical-chain` have no documented JSON output, so they are parsed from locale-stable text.
- Failed units prefer systemd D-Bus `ListUnitsFiltered`, then `systemctl list-units --state=failed --plain`.
- Coredumps prefer `coredumpctl --json=short list` plus a `_BOOT_ID=` match for the current boot. `coredumpctl` has no `--boot` option.
- Findings use bounded `journalctl --output=json` queries for the current boot only. Detectors interpret normalized entries; the UI does not browse the journal.
- Security uses `systemd-analyze --system --no-pager --json=short security` once per Security page load or refresh, then the same command with one unit name for per-setting details. Overview does not run this analysis. Unit names are separate argv entries.
- Boot plot uses `systemd-analyze --system --no-pager plot` (SVG stdout). `--json` / `--table` emit raw timings, not the chart, and are not used. The SVG is sanitized, then shown as `image/svg+xml` through a blob URL in an `<img>`. Overview does not generate a plot.
- Verification lists installed system unit files through D-Bus `ListUnitFiles` (then `systemctl list-unit-files`) and runs `systemd-analyze --system --no-pager --man=no verify UNIT` with the unit name as its own argv entry. Findings come from stderr/stdout text; there is no JSON mode. Default systemd 255 exit status is 0 even when warnings exist.
- Providers fail independently. A missing plot, verify, journalctl, or security subcommand does not hide the other pages.

## Known limitations

- `systemd-analyze blame` measures activation duration, not boot delay. Units start in parallel.
- `systemd-analyze critical-chain` is an estimate. Socket activation, skipped activating states, and timed-out jobs are not fully represented.
- This host must be booted with systemd as PID 1 for live `time` / `plot` / `blame` / `critical-chain` data. `verify` can still check unit files without a live system bus in some environments.
- Ordinary users typically see only journal data they can read. Diagnostics does not auto-escalate. Verification of some protected generator paths may require privileges; v0.5 does not enable `--generators` and does not request superuser for every verify.
- `coredumpctl list` with no matches exits non-zero (`No coredumps found.`); the UI treats that as an empty list.
- `journalctl --grep` exits 1 when nothing matches; Findings treats that as an empty result for that query.
- `systemd-analyze security` without unit names inspects every loaded long-running system `.service`. That can take several seconds on a busy host, so the page snapshots once and does not poll.
- `--offline` is not used. That mode reviews unit files through a private manager, not the live system instance.
- User-manager (`--user`) analysis is out of scope for v0.5.
- `systemd-analyze plot` SVG can be large. The plugin caps it at 8 MiB, times out after 60 s, keeps only the current session's plot in memory, and regenerates only on Boot page load or Refresh.
- `systemd-analyze verify` may report problems in related units. The UI labels those as related rather than as errors in the selected unit.
- v0.5 does not include a journal browser, CVE scanning, automatic hardening, boot history, GDB, core download, core deletion, unit editing, daemon-reload, or service start/stop controls.

See `IMPLEMENTATION.md` for the architectural contract.
