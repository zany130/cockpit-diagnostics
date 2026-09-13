# Changelog

All notable user-facing changes to cockpit-diagnostics are documented here.

## 1.0.0 — 2026-09-13

First stable release. Feature milestones v0.1 through v0.5 are included; this version is a packaging, documentation, testing, and hardening pass rather than a new diagnostic feature.

### Boot diagnostics

- Current-boot timing from `systemd-analyze time`, including firmware/loader/kernel/initrd/userspace breakdown when systemd reports those phases
- `systemd-analyze blame` and `systemd-analyze critical-chain` with interpretation caveats
- Graphical boot timeline from `systemd-analyze plot` (sanitized SVG shown as an image)

### Crashes and findings

- Current-boot coredumps from `coredumpctl`
- Current-boot filtering using normalized boot IDs (canonical UUID and compact systemd/journal 32-hex forms)
- Conservative OOM kill detection and high-priority kernel findings
- Empty and permission-denied states without pretending to be a journal browser

### systemd security analysis and verification

- `systemd-analyze security` for loaded long-running system services, with explicit non-vulnerability wording
- Read-only `systemd-analyze verify` of installed unit files
- No automatic hardening, unit edits, daemon-reload, or service start/stop

### Cockpit integration

- Diagnostics entry in Cockpit navigation
- Overview teasers into Boot, Crashes, Findings, Security, and Verification
- View Service and View Logs using Cockpit shell component routes (`/system/services`, `/system/logs`)
- Support for template unit names containing `@`

### Hardening and real-host compatibility

- Isolated providers: one missing tool does not hide unrelated pages
- Ordinary `cockpit.spawn()` calls do not attach a stdout streamer (Cockpit would otherwise return empty output)
- Boot-ID parsing rejects malformed IDs instead of silently truncating
- UI polish for narrow/mobile layouts
- English-only UI for 1.0.0 (incomplete demo translation removed)

### Packaging

- RPM package `cockpit-diagnostics` version 1.0.0, noarch
- Production install into `/usr/share/cockpit/diagnostics/`
- `make devel-install` remains development-only
