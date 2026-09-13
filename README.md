# cockpit-diagnostics

`cockpit-diagnostics` is a Cockpit application that adds deep systemd and Linux diagnostics while reusing Cockpit Services and Logs for management and raw evidence.

It answers questions such as how long the current boot took, which units failed, whether processes dumped core, whether the kernel reported out-of-memory kills, how strongly loaded system services use systemd sandboxing, and what `systemd-analyze verify` reports for an installed unit file.

It does not invent a health score, scan for vulnerabilities, browse the journal, edit units, or restart services.

## Features

- **Overview** — concise snapshot of failed units, crashes, and implemented findings
- **Boot** — total boot timing, firmware/loader/kernel/initrd/userspace breakdown where systemd reports it, `systemd-analyze blame`, `systemd-analyze critical-chain`, and a graphical boot timeline from `systemd-analyze plot`
- **Crashes** — current-boot coredumps from `coredumpctl`, with details and a jump into Cockpit Logs
- **Findings** — conservative current-boot OOM kill detection and high-priority kernel events; not a journal browser
- **Security** — `systemd-analyze security` service exposure/hardening analysis (not a vulnerability scanner)
- **Verification** — read-only `systemd-analyze verify` of installed unit files (no unit editing or daemon-reload)
- **Cockpit integration** — View Service and View Logs use Cockpit shell routes

## Requirements

- A systemd-based Linux host with [Cockpit](https://cockpit-project.org/)
- systemd as PID 1 for live boot timing and plot (containers without a system manager degrade those views)
- Node.js 18+ and `make` only when building from source

Hard runtime dependencies of the RPM:

- `cockpit-bridge`
- `systemd`

Optional capabilities are detected at runtime. Missing tools disable only the matching page or card:

- `coredumpctl` / `systemd-coredump` — Crashes
- `journalctl` with sufficient access — Findings
- `systemd-analyze security` — Security
- `systemd-analyze plot` — Boot timeline (other Boot views still work)
- `systemd-analyze verify` — Verification

Minimum tested baseline: systemd 255-family interfaces on a Fedora/Bazzite host, Cockpit package API 137+. Other modern systemd distributions should work through feature probing rather than distro-name branching.

## Installation

### RPM (production)

Build the package (see [Packaging](#packaging)), then install the noarch RPM:

```bash
sudo dnf install ./cockpit-diagnostics-1.0.0-1*.noarch.rpm
```

Cockpit loads the plugin from `/usr/share/cockpit/diagnostics/`. Reload the Cockpit session if Diagnostics does not appear immediately.

### Manual production install

From a built source tree, install the same production files the RPM would:

```bash
make
sudo make install PREFIX=/usr
```

That copies `dist/` to `/usr/share/cockpit/diagnostics/` and the AppStream metadata to `/usr/share/metainfo/`. This is not a development symlink.

### Uninstall

RPM:

```bash
sudo dnf remove cockpit-diagnostics
```

Manual:

```bash
sudo rm -rf /usr/share/cockpit/diagnostics
sudo rm -f /usr/share/metainfo/org.cockpit_project.diagnostics.metainfo.xml
```

Development files in a git checkout are not touched by either uninstall path.

## Usage

Open **Diagnostics** in the Cockpit sidebar.

- **Overview** — counts and teasers. It does not run plot, security analysis, or unit verification.
- **Boot** — timing first, then the timeline, blame table, and critical chain. Blame measures activation duration, not boot delay; units start in parallel.
- **Crashes** — coredumps for the current boot only.
- **Findings** — OOM kills and high-priority kernel messages for the current boot. Use **View Logs** for the raw journal.
- **Security** — systemd's own exposure values for loaded long-running system `.service` units. A high number means fewer sandboxing settings are applied; it does not prove a CVE.
- **Verification** — select an installed unit file and run systemd's verifier. Related-unit warnings are labeled as related. An empty result is not a promise that the unit will start.

Use **Refresh** on a page to rerun that page's providers. The plugin does not poll.

## What it is not

- Not a replacement for Cockpit Logs
- Not a replacement for Cockpit Services
- Not a vulnerability, malware, or exploitability scanner
- Not a monitoring daemon or metrics collector
- Not automatic remediation, hardening, or unit editing
- Not a system-wide health score

## Security and privacy

- No telemetry
- No remote diagnostic upload
- No persistent diagnostic database
- No automatic remediation
- No service start/stop/restart/enable/disable
- No unit-file editing and no `daemon-reload`
- Read-mostly: diagnostic commands run locally through Cockpit/`cockpit.spawn()` and systemd D-Bus
- Commands use argv arrays, never `sh -c`
- The plugin does not request Cockpit superuser for diagnostic commands; it shows whatever the logged-in session can already read
- Journal, coredump, and unit text is rendered as text, not HTML
- `systemd-analyze plot` SVG is sanitized and shown as an `<img>` blob, not injected as live markup

## Known limitations

- Live `systemd-analyze time` / `plot` / `blame` / `critical-chain` need systemd as PID 1
- Firmware or loader timing is omitted when systemd does not report those phases
- Ordinary users typically see only journal and coredump data they can read
- `coredumpctl list` with no matches is shown as an empty Crashes page
- `systemd-analyze security` inspects loaded long-running system services and can take several seconds; the page snapshots once
- `systemd-analyze verify` may mention related units; exit status 0 can still include warnings
- User-manager (`--user`) analysis is out of scope
- The shipped UI is English. Gettext infrastructure remains for future catalogs; there is no partial demo translation

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture boundaries and test expectations.

```bash
git clone <repository>
cd cockpit-diagnostics
make
make devel-install
```

`make devel-install` is **development-only**. It symlinks `dist/` into `~/.local/share/cockpit/diagnostics`. Do not use it as a production install.

Local fixture-backed UI preview (not a live systemd host):

```bash
make
npm run preview
```

Then open `http://127.0.0.1:43127/`.

Tests:

```bash
npm run typecheck
npm run eslint
npm run stylelint
npm test
```

Browser integration tests (`make check`) need Cockpit bots/VM images. See [docs/manual-test-matrix.md](docs/manual-test-matrix.md).

## Packaging

```bash
make rpm
```

That produces a noarch RPM such as `cockpit-diagnostics-1.0.0-1.fc42.noarch.rpm` (the distro suffix depends on the build host). The package contains production Cockpit files under `/usr/share/cockpit/diagnostics/` plus AppStream metadata. It does not ship `node_modules`, tests, preview tooling, or the development symlink workflow.

Inspect:

```bash
rpm -qip cockpit-diagnostics-1.0.0-*.noarch.rpm
rpm -qlp cockpit-diagnostics-1.0.0-*.noarch.rpm
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GNU Lesser General Public License, version 2.1 or later. See [LICENSE](LICENSE). Files adapted from the Cockpit Starter Kit retain their upstream notices.
