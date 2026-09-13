# Manual validation checklist

Use this for a v1.0.0 release candidate on a real systemd host. The fixture preview (`npm run preview`) can smoke-test layout and copy; it cannot prove `cockpit.spawn()`, journal access, or RPM discovery.

## Environment notes

Record:

- distribution and version
- systemd version (`systemd-analyze --version`)
- Cockpit version
- whether the session is an admin or limited user
- whether the host is a VM, container, or bare metal

This plugin was integration-tested during development on a Bazzite/systemd host. Do not claim additional real-host results that were not actually run.

## Automated (every change)

```bash
npm run typecheck
npm run eslint
npm run stylelint
npm test
NODE_ENV=production ./build.js
```

## Cockpit browser tests (when bots/VMs exist)

Requires Cockpit `test/common` (from `make`) and `bots` VM images.

```bash
make bots
make check
```

Default `TEST_OS` is `centos-9-stream`. Expected result: `test/check-application` logs into Cockpit, opens `/diagnostics`, walks Overview/Boot/Crashes/Findings/Security/Verification, and repeats Boot at a 390×844 viewport.

This environment cannot run those VMs unless bots images are present.

## Normal systemd host

Install via RPM or `make devel-install` (devel only). Reload the Cockpit session.

For each page, confirm content loads or a specific unavailable/empty/permission state appears — not a blank application.

| Page | Expect |
| --- | --- |
| Overview | Failed-unit, crash, and findings teasers; no plot/security/verify commands |
| Boot | Timing, timeline (if plot exists), blame, critical chain, caveats |
| Crashes | Current-boot coredumps or empty state |
| Findings | OOM/kernel findings or empty state; not a log stream |
| Security | Exposure table and “not a vulnerability scan” wording |
| Verification | Installed unit list; verify output for a selected unit |

Refresh on each page and confirm last-refreshed updates.

## Empty states

Where the host allows:

- no failed units
- no coredumps
- no Findings
- verify of a clean unit shows no findings (not a failure)
- missing firmware/loader timing still shows kernel/userspace

## Failure isolation

Break one capability at a time (PATH hide, `chmod`, or a unit without the subcommand) and confirm other pages still work:

- `systemd-analyze` missing, Crashes still works
- `coredumpctl` missing, Boot still works
- journal access denied, Security still works
- Security subcommand missing, Findings still works
- Verification missing, Boot still works
- plot fails, textual Boot diagnostics remain
- unreadable `/proc/sys/kernel/random/boot_id`, only Crashes degrades
- Findings provider failure does not break Overview/Boot/Crashes
- Security analysis failure does not break other pages

## Navigation

- Overview cards open the matching page
- View Service → `/system/services#/<unit>` including `user@UID.service`
- View Logs → `/system/logs` with `service=`, `start=boot`, and `prio=*` (not `logs.html`)
- In-app tabs: Overview, Boot, Crashes, Findings, Security, Verification
- Mobile/horizontal nav remains usable

## Narrow / mobile layout

Test every page at approximately 390px wide:

- tables scroll inside the card, not the whole page
- alerts stay inline and readable
- drawers/details wrap
- Refresh stays on-screen
- no accidental horizontal page scrolling

## RPM (Fedora/Bazzite-family)

```bash
make rpm
sudo dnf install ./cockpit-diagnostics-1.0.0-1*.noarch.rpm
```

Confirm:

- Diagnostics appears in Cockpit without `make devel-install`
- static assets and `manifest.json` load
- all six pages open

Then:

```bash
sudo dnf remove cockpit-diagnostics
```

Confirm `/usr/share/cockpit/diagnostics/` is gone and Cockpit no longer advertises the packaged plugin. A git checkout used for `make devel-install` must remain untouched.

## Do not claim

- live `systemd-analyze plot` success from the fixture preview
- browser `make check` success unless the VM run completed
- RPM install/uninstall success unless `dnf` was actually used on a matching host
