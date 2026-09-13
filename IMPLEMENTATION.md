# IMPLEMENTATION.md — cockpit-diagnostics

> Status: implementation specification  
> Target: Cockpit third-party application/plugin  
> Primary stack: React + TypeScript + PatternFly + documented Cockpit APIs  
> Initial posture: read-mostly, stateless, no custom daemon  
> Last technical review: 2026-09-13

---

## 1. Purpose

`cockpit-diagnostics` is a Cockpit application that exposes existing Linux and systemd diagnostic capabilities through a discoverable, native-feeling Cockpit UI.

The plugin is **not** a replacement for Cockpit's existing Services, Logs, Storage, Networking, Metrics, Terminal, SOS report, or other administration pages.

Its job is to answer questions such as:

- Why did this boot take as long as it did?
- Which units were on the boot critical path?
- Which units took the longest to activate?
- Are any systemd units currently failed?
- Did important processes crash?
- Are there high-priority journal or kernel errors?
- Were there OOM kills?
- How strongly sandboxed are system services according to `systemd-analyze security`?
- Are there obvious diagnostic conditions that deserve administrator attention?

The plugin should surface facts, context, and links to the existing Cockpit pages where the administrator can act.

---

## 2. Product principles

### 2.1 Use the system as the source of truth

Do not create an independent machine-state database.

Prefer existing system interfaces and tools:

- systemd D-Bus APIs where practical and stable
- `systemd-analyze`
- `systemctl`
- `journalctl`
- `coredumpctl`
- documented Cockpit APIs

The plugin is a presentation and correlation layer over Linux/systemd diagnostics.

### 2.2 Do not duplicate existing Cockpit administration

If Cockpit already has a good page for managing something, link to it.

Examples:

- service start/stop/restart/enable/disable -> existing Services page
- full log browsing -> existing Logs page
- storage repair/configuration -> existing Storage page
- package updates -> existing Software Updates page

The diagnostics plugin may summarize or filter relevant information, but should not become a second service manager or log browser.

### 2.3 Read-mostly by default

v0.x should diagnose, not automatically fix.

Do not:

- restart services automatically
- change unit files automatically
- change sysctls
- alter boot configuration
- disable services
- delete coredumps
- modify journald settings
- write persistent state solely to create a "health history"

Future write actions must be explicit, narrow, reviewable, and justified.

### 2.4 Facts over opaque scores

Do not invent a single "system health score".

Prefer:

- `2 failed units`
- `1 coredump this boot`
- `14.2 s on the critical path`
- `3 priority 0–3 journal entries`

Avoid:

- `Health: 73/100`
- `Performance score: C+`
- unsupported claims such as "this service is definitely slowing down your computer"

### 2.5 Distinguish observation from interpretation

UI language must make clear whether something is:

1. a direct fact from the system,
2. a warning based on a documented rule,
3. an interpretation that may have caveats.

For example, `systemd-analyze blame` is useful but can be misleading because unit startup happens in parallel and activation time does not automatically mean critical-path delay.

---

## 3. Explicit non-goals

The following are out of scope unless a future specification explicitly adds them:

- replacing Cockpit Services
- replacing Cockpit Logs
- replacing SOS reports
- remote fleet management
- centralized monitoring
- a custom background daemon
- a custom metrics collector
- a custom database
- AI-generated root-cause claims
- automatic remediation
- general process management
- generic hardware inventory
- live temperature/fan monitoring
- general firewall management
- package installation/update management

Hardware inventory belongs in `cockpit-hwinfo`.

Live sensors should integrate with an existing Cockpit sensors project rather than be duplicated.

---

## 4. Supported environment

### 4.1 Primary target

Modern systemd-based Linux distributions with Cockpit installed.

Development should be tested first on a recent Fedora-family environment, but the implementation must not assume Fedora-specific paths when a systemd/Cockpit interface is available.

### 4.2 Graceful degradation

Every diagnostic provider must be capability-detected.

The application must remain usable when one feature is unavailable.

Examples:

- `systemd-analyze` missing -> Boot Analysis unavailable; other pages still work
- `coredumpctl` missing -> Crashes page shows an informative empty state
- journal access restricted -> Findings explains the permission limitation
- a subcommand unsupported by an older systemd -> hide/disable only that feature

Do not fail the whole application because one command fails.

---

## 5. Technology and project baseline

Start from the current Cockpit Starter Kit or an equivalent current Cockpit application structure.

Use:

- TypeScript
- React
- PatternFly components already suitable for Cockpit
- documented Cockpit APIs only
- `cockpit.spawn()` for ordinary process execution
- `cockpit.jump()` only for documented/stable component paths
- systemd D-Bus APIs when they materially reduce fragile text parsing

Avoid importing private implementation modules from Cockpit core.

Do not rely on undocumented component URLs or Cockpit internals.

---

## 6. Repository structure

Recommended structure:

```text
cockpit-diagnostics/
├── README.md
├── IMPLEMENTATION.md
├── ROADMAP.md
├── package.json
├── manifest.json
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.ts
│   │   └── navigation.ts
│   ├── components/
│   │   ├── AsyncState.tsx
│   │   ├── CapabilityNotice.tsx
│   │   ├── DiagnosticStatus.tsx
│   │   └── UnitLink.tsx
│   ├── pages/
│   │   ├── OverviewPage.tsx
│   │   ├── BootPage.tsx
│   │   ├── CrashesPage.tsx
│   │   ├── FindingsPage.tsx
│   │   ├── SecurityPage.tsx
│   │   └── VerificationPage.tsx
│   ├── providers/
│   │   ├── capabilities.ts
│   │   ├── command.ts
│   │   ├── systemdAnalyze.ts
│   │   ├── systemdUnits.ts
│   │   ├── journal.ts
│   │   ├── coredump.ts
│   │   └── security.ts
│   ├── parsers/
│   │   ├── bootTime.ts
│   │   ├── blame.ts
│   │   ├── criticalChain.ts
│   │   ├── coredump.ts
│   │   ├── journal.ts
│   │   └── security.ts
│   ├── detectors/
│   │   ├── oom.ts
│   │   └── kernel.ts
│   ├── types/
│   │   ├── boot.ts
│   │   ├── diagnostics.ts
│   │   ├── findings.ts
│   │   ├── security.ts
│   │   └── providers.ts
│   └── utils/
│       ├── duration.ts
│       ├── locale.ts
│       └── errors.ts
├── test/
│   ├── fixtures/
│   ├── parsers/
│   └── ui/
└── dist/
```

This is guidance, not a requirement to create abstraction for abstraction's sake.

Keep the codebase small.

---

## 7. Command execution rules

### 7.1 Prefer argv arrays

Use:

```ts
cockpit.spawn(["systemd-analyze", "blame"], options)
```

Do not use:

```ts
cockpit.spawn(["sh", "-c", "systemd-analyze blame"])
```

unless shell semantics are truly required and reviewed.

### 7.2 No user-controlled shell interpolation

Never concatenate unit names, paths, filters, or other user input into a shell string.

### 7.3 Locale stability

Text parsers must request a predictable locale where possible, for example `LC_ALL=C`.

Do not assume the administrator uses English.

If a command provides a documented machine-readable output format, prefer it over human-readable text.

### 7.4 Privilege policy

Run unprivileged whenever possible.

If elevated access is required:

- use Cockpit's documented privilege mechanism
- request it only for that operation
- do not store credentials
- do not create a privileged persistent helper unless later justified

### 7.5 Timeouts and cancellation

Long-running commands must be cancellable or bounded.

The UI must not remain indefinitely in a spinner because a diagnostic command hangs.

### 7.6 Error normalization

All providers should normalize failures into a typed error model, e.g.:

```ts
type ProviderErrorKind =
  | "not-found"
  | "not-supported"
  | "permission-denied"
  | "timeout"
  | "command-failed"
  | "parse-failed"
  | "unknown";
```

The UI should present useful messages without dumping raw stack traces.

---

## 8. Capability detection

Run lightweight feature detection once per application load and cache it in memory.

Example model:

```ts
interface DiagnosticCapabilities {
  systemdAnalyze: boolean;
  systemdAnalyzePlot: boolean;
  systemdAnalyzeVerify: boolean;
  systemdAnalyzeSecurity: boolean;
  journalctl: boolean;
  coredumpctl: boolean;
  systemctl: boolean;
  systemdVersion?: number;
}
```

Do not assume that the presence of `systemd-analyze` guarantees every modern subcommand or option exists.

Prefer feature probing over distro-name conditionals.

---

## 9. Data architecture

UI components must not parse raw command output.

Correct flow:

```text
Cockpit API
   ↓
provider
   ↓
parser / normalizer
   ↓
typed domain model
   ↓
React UI
```

Example domain types:

```ts
interface BootSummary {
  firmwareUs?: number;
  loaderUs?: number;
  kernelUs?: number;
  initrdUs?: number;
  userspaceUs?: number;
  totalUs?: number;
  target?: string;
}

interface UnitActivationTiming {
  unit: string;
  durationUs: number;
}

interface CriticalChainNode {
  unit: string;
  activatedAtUs?: number;
  activationDurationUs?: number;
  children: CriticalChainNode[];
}

interface FailedUnit {
  unit: string;
  loadState?: string;
  activeState?: string;
  subState?: string;
  description?: string;
}

interface DiagnosticFinding {
  severity: "info" | "warning" | "error";
  category: "memory" | "kernel";
  title: string;
  summary: string;
  source: "kernel" | "systemd-oomd";
  count: number;
  evidence?: { message?: string };
}
```

Do not expose raw provider output directly to page components unless the UI explicitly offers a "Raw output" disclosure.

---

## 10. Navigation model

Top-level pages:

```text
Diagnostics
├── Overview
├── Boot
├── Crashes
├── Findings
├── Security
└── Verification
```

Start smaller in v0.1.

### Deep links

Where a stable Cockpit target exists, allow actions such as:

- View service
- View logs

Use only documented/stable Cockpit component paths.

If a stable deep link to an exact unit or log filter cannot be confirmed, link to the nearest stable Cockpit page rather than depending on an internal URL.

---

## 11. Overview page

Purpose: give a concise, deterministic summary of diagnostic state.

Suggested cards:

### Boot

Show:

- total boot duration if available
- userspace duration
- critical-chain headline
- link to Boot page

Do not label a boot "slow" using an arbitrary universal threshold.

If warnings are introduced later, compare against explicit thresholds or user-configurable policy and explain the rule.

### Failed units

Show current failed-unit count.

Source should preferably be systemd state through a stable interface; `systemctl --failed` is acceptable if needed.

Click through to details and/or Cockpit Services.

### Crashes

Show coredump count for the current boot if `coredumpctl` is available.

Do not claim every coredump is a serious system failure.

### Findings

Show a count of supported current-boot diagnostic findings (OOM kill activity and high-priority kernel events).

Do not claim the absence of findings means the system is healthy.

Click through to the Findings page.

### Security

Teaser only. Do not run `systemd-analyze security` on Overview.

### Verification

Teaser only. Do not run `systemd-analyze plot` or `systemd-analyze verify` on Overview.

### Overall summary

Do not generate a numeric score.

Use a factual summary such as:

```text
3 items may need attention
- 1 failed unit
- 1 coredump
- 1 high-priority kernel message
```

---

## 12. Boot page

This is the core v0.1 feature.

### 12.1 Boot summary

Use `systemd-analyze time` or a more stable/machine-readable equivalent if available.

Display available phases:

- firmware
- loader
- kernel
- initrd
- userspace
- total

Not every environment reports every phase.

VMs and containers may omit firmware/loader data.

### 12.2 Unit activation timings

Use `systemd-analyze blame`.

Display a sortable table:

| Unit | Activation time | Critical path |
|---|---:|---|
| example.service | 4.2 s | Yes/No/Unknown |

Important UI caveat:

> Activation duration does not necessarily mean the unit delayed boot. Units run in parallel and some unit types cannot be measured meaningfully by `blame`.

This caveat must be visible, not buried in documentation.

### 12.3 Critical chain

Use `systemd-analyze critical-chain`.

Represent it as a nested tree or timeline-friendly structure.

Show:

- unit
- activation timestamp when available
- activation duration when available

Do not interpret the chain as perfectly causal in every case. systemd documents limitations involving parallel execution, socket activation, units that do not pass through an activating state, and jobs/timeouts not represented by this output.

### 12.4 Boot plot

v0.5 (verified against systemd 255):

Use `systemd-analyze --system --no-pager plot`. Canonical stdout is SVG. `--json=` / `--table` emit raw timing tables, not the chart; do **not** reconstruct bars from JSON. `--system` / `--user` exist; this plugin is system-only. Firmware, loader, kernel, and initrd bars appear in systemd's SVG when those timestamps exist.

This is an additional visualization on the Boot page. `time`, `blame`, and `critical-chain` remain authoritative for durations.

The plot is generated once per Boot page load or Refresh. Do not poll. Do not persist historical plots. Timeout: 60 s. Size cap: 8 MiB. Run unprivileged. Hosts not booted with systemd as PID 1 fail this command; the rest of Boot must still work.

SVG security:

- treat plot output as untrusted even though it is locally generated
- sanitize to an element/attribute allowlist; strip script, foreignObject, iframe, anchors, event handlers, javascript/data hrefs, `@import`, and `url()` in CSS
- display the sanitized SVG as `image/svg+xml` through a blob URL in an `<img>`
- do not inject SVG with `dangerouslySetInnerHTML` or other raw HTML APIs

SVG as an image cannot run script or navigate the Cockpit origin. Sanitization is defense in depth.

### 12.5 Historical boot comparison

Not part of v0.x.

`systemd-analyze` timing information is primarily current-manager/current-boot state and is not a historical boot-time database.

Do **not** add a SQLite database, daemon, timer, or persistent history merely to claim "previous boot comparison".

If historical comparison is added later, it requires a separate design decision covering:

- what is persisted
- retention
- privacy
- storage location
- collection timing
- whether the feature remains optional

---

## 13. Failed unit diagnostics

The plugin may summarize current failed units.

For each failed unit show:

- unit name
- description
- active/substate where available
- timestamp if readily available
- concise failure reason if available from systemd metadata
- actions:
  - View service
  - View logs

Do not add start/stop/restart buttons in this plugin in v0.x.

The existing Services page owns service control.

---

## 14. Crashes page

Use `coredumpctl` when available.

Display a table with available fields such as:

- timestamp
- executable/comm
- PID
- UID/user
- signal
- systemd unit
- boot association
- storage/presence status

On expansion/detail view, show useful metadata that does not require dumping huge binary core contents into the browser.

Potential future actions:

- copy metadata
- open relevant logs
- show a backtrace if an appropriate, bounded, safe command can produce one

Do not automatically run debuggers or install debuginfo.

Do not delete cores in v0.x.

---

## 15. System Findings page

This page is **not** a journal viewer and must not duplicate Cockpit Logs.

Cockpit Logs answers: “Show me the journal.”
Diagnostics Findings answers: “Show me noteworthy diagnostic conditions and link me to the underlying evidence.”

v0.3 detectors (current boot only):

- conservative out-of-memory kill activity (kernel OOM killer and/or systemd-oomd)
- high-priority kernel journal events (priorities emerg, alert, crit, err)

Do **not** implement generic journal browsing, searching, filtering, pagination, follow/live mode, or a raw log table.

Every finding should offer `View in Logs` when a stable Cockpit navigation target can be constructed. Inspect raw evidence in Cockpit Logs. Use only documented Logs filters (`service`, `tag`, `prio`, `start=boot`, and a short literal `grep` when that pattern is regex-safe). Prefer a broader reliable Logs destination over a fragile deep link.

Empty state (no matches from implemented detectors):

> No supported diagnostic findings detected for this boot.

Do not say the system is healthy. This plugin only detects a defined subset of possible problems.

OOM findings use warning severity: a kill was reported, but that does not prove physical RAM exhaustion was the sole cause. Kernel findings map journal priorities 0–2 (emerg/alert/crit) to error and priority 3 (err) to warning. Warnings (priority 4+) are out of scope.

Journal queries are current-boot only, server-side filtered, line-bounded, and a snapshot. Do not poll the journal and do not load the persistent journal into the browser.

### Rules

- show the exact scope used (current boot; implemented detectors only)
- expose timestamps
- group only identical kernel messages; do not fuzzy-merge distinct errors
- never summarize away the original evidence
- do not classify ordinary memory-pressure messages as OOM kills
- do not include kernel warnings by default
- do not label application errors as kernel findings

---

## 16. Security page

Use `systemd-analyze security` where supported.

Purpose: visualize systemd service sandboxing/exposure assessments.

The UI must explicitly explain:

> `systemd-analyze security` evaluates how strongly a service uses systemd sandboxing and security-related settings. Its exposure score is not a guarantee that software is secure or insecure.

v0.4 (verified against systemd 255):

- Analyze the **system manager** only. Label the scope as system services. Do not mix user-manager units.
- Summary: `systemd-analyze --system --no-pager --json=short security` lists currently loaded long-running `.service` units (oneshot units are skipped). JSON objects use `unit`, `exposure` (decimal string 0.0–10.0 in systemd 255; a JSON number is also accepted), `predicate` (assessment), and `happy` (ignore in the UI).
- Detail: the same command with one unit name returns the per-setting table as JSON objects with `set`, `name`, `json_field`, `description`, and `exposure`.
- Assessment labels come from systemd: `PERFECT`, `SAFE`, `OK`, `MEDIUM`, `EXPOSED`, `UNSAFE`, `DANGEROUS`. Do not invent replacements.
- Run the all-unit summary once per page load/refresh. Lazy-load per-unit details when a row is opened. Do not poll. Do not persist a security database. Do not run this analysis on Overview.
- Timeouts: 60 s for the all-unit summary, 25 s for one-unit details. Cache details in memory for the current Security page visit only.
- Do not use `--offline` for the product path; that reviews unit files through a private manager, not the live system instance.

Show:

- service/unit
- exposure level/score as reported by systemd
- per-setting findings when available
- description of what each setting means (from systemd JSON)
- filtering/sorting

Do not invent an independent security score.

Do not auto-edit unit hardening directives.

A future feature may generate suggested drop-in content, but that must be separately specified and explicitly reviewed by the administrator.

---

## 17. Unit verification

v0.5 (verified against systemd 255):

`systemd-analyze verify FILE...` accepts installed unit names as well as filesystem paths. This plugin verifies **installed system unit names only**, selected from D-Bus `ListUnitFiles` (fallback: `systemctl --system --no-pager --no-legend --full --plain list-unit-files`). Do not accept arbitrary filesystem paths, `:alias` syntax, or leading `-`. Pass the unit name as its own argv entry:

```text
systemd-analyze --system --no-pager --man=no verify UNIT
```

`--man=no` skips Documentation= man-page existence checks (faster, less noise). Do not pass `--generators` (requires privileges). Do not use `--user`. There is no JSON/table mode.

Findings are text, usually on stderr. Collect stderr with `err: "out"`. Default (no `--recursive-errors`) **exits 0 even when warnings exist**; missing dependencies or hard load failures can still exit 1. Do **not** treat exit status as the finding list. A missing unit prints `Unit NAME not found.` and may still exit 0.

Related units are also loaded. Verifying `ok.service` that Requires `warn.service` can print warnings for `warn.service`. The UI must label those as related-unit findings, not as "Error in ok.service".

Do not edit units, write drop-ins, daemon-reload, start/stop/enable/disable, or auto-repair. View Service links to Cockpit Services.

Run unprivileged. If a protected path later needs privilege, request it only for that operation and explain the limitation. Do not auto-escalate every verification.

---

## 18. System scope vs user scope

v0.1 should prioritize the **system manager**.

A later release may add a clear scope selector:

- System
- Current user

If user scope is supported:

- use `systemd-analyze --user` / appropriate APIs
- label the scope prominently
- never mix system and user-manager results in the same table without explicit labeling

Do not attempt to inspect other users' user managers by default.

---

## 19. Refresh behavior

Diagnostics are snapshots.

Provide:

- a visible Refresh action
- last-refreshed time
- independent refresh per expensive page where appropriate

Do not continuously poll expensive commands.

Respect Cockpit page visibility; avoid repeated expensive work while the page is hidden.

---

## 20. Performance constraints

Targets:

- Overview should become interactive quickly even if one provider is slow.
- Load providers independently where possible.
- Do not block the whole page on a boot plot or coredump query.
- Cap large result sets initially and provide pagination or "show more".
- Do not pull the entire journal into browser memory.

---

## 21. Security constraints

Mandatory:

- argv arrays instead of shell strings
- no arbitrary shell execution from user input
- no `eval`
- no HTML injection
- sanitize/contain SVG rendering
- no remote upload of logs or diagnostics
- no hidden telemetry
- no credentials stored by this plugin
- no custom root daemon in v0.x
- least privilege

The plugin must never transmit system diagnostic data off-host unless a future feature explicitly requests informed user consent.

---

## 22. Accessibility and UX

Use PatternFly components and Cockpit conventions.

Requirements:

- keyboard-accessible controls
- useful empty states
- non-color-only status meaning
- human-readable durations
- exact values available where useful
- responsive tables
- loading, empty, unavailable, permission-denied, and error states are distinct

Avoid novelty dashboard styling that makes the page look unlike Cockpit.

---

## 23. Parsing strategy and test fixtures

Text parsing is a risk area.

For every text parser:

1. keep it pure where possible
2. give it captured fixtures
3. test normal output
4. test empty output
5. test malformed/partial output
6. test optional fields
7. test representative output from more than one supported systemd version where practical

Never write tests that only mock the final typed model; parser tests need real representative command output.

If systemd provides a documented JSON/table format, prefer that and test that format.

---

## 24. Testing layers

### Unit tests

Required for:

- duration conversion
- `systemd-analyze time` normalization
- blame parsing/normalization
- critical-chain parsing/normalization
- coredump parsing
- capability handling
- error normalization

### Component tests

Required for:

- loading state
- empty state
- unavailable provider
- permission denied
- populated tables
- refresh

### Integration/end-to-end tests

At minimum:

- plugin loads in Cockpit
- navigation works
- Boot page renders real data
- failed unit count works
- missing optional command does not crash plugin

Do not require deliberately breaking the host to run routine tests.

---

## 25. Logging and debug behavior

Developer diagnostics may log provider failures to the browser console in development builds.

Production UI should present concise errors.

Never log sensitive journal contents unnecessarily.

A future `Debug information` view may expose:

- plugin version
- Cockpit version if available
- systemd version
- capability matrix
- failed provider names

---

## 26. Milestones

### v0.1 — Boot diagnostics foundation

Implement only:

1. Cockpit package shell
2. Overview page
3. Boot page
4. capability detection
5. `systemd-analyze time`
6. `systemd-analyze blame`
7. `systemd-analyze critical-chain`
8. current failed-unit count/list
9. stable links to existing Cockpit pages where supported
10. parser and basic UI tests

Do not implement crashes, journal correlation, security analysis, verification, historical persistence, or automatic fixes yet.

### v0.2 — Crashes

Add:

- `coredumpctl` capability
- Crashes page
- current-boot filtering
- crash detail drawer
- links to relevant logs where feasible

### v0.3 — System Findings

Add:

- `journalctl` capability
- Findings page (not a journal browser)
- conservative current-boot OOM kill detection
- high-priority kernel events (emerg/alert/crit/err)
- exact-message grouping for repeated kernel errors
- links to Cockpit Logs as the raw evidence viewer

### v0.4 — systemd security

Add:

- `systemd-analyze security`
- service exposure table
- per-setting detail
- prominent score caveat

### v0.5 — Boot visualization and verification

Add:

- safe boot plot rendering from `systemd-analyze plot` SVG
- optional unit verification from `systemd-analyze verify`

v0.5 as implemented does **not** redesign the critical-chain tree. The milestone request was plot + verify only; critical-chain remains the v0.1 nested tree.

### v1.0 — Stability/polish

Require:

- tested graceful degradation
- accessibility review
- packaging documentation
- distro testing matrix
- stable error behavior
- translation readiness
- no known shell-injection surfaces
- no dependence on private Cockpit APIs

---

## 27. Definition of done for v0.1

v0.1 is complete when:

- installation adds a working Diagnostics entry to Cockpit
- Overview loads without requiring root for ordinary information
- Boot page shows boot-phase timing when available
- blame table is sortable
- critical chain is readable and preserves hierarchy
- UI visibly explains blame/critical-chain limitations
- failed units are listed
- a failure in any one provider does not break other sections
- all command execution uses reviewed argv-style invocation
- parsers have fixture-based tests
- there is no persistent daemon
- there is no local database
- there is no automatic repair behavior
- existing Cockpit service/log management is not duplicated

---

## 28. Cursor/agent operating rules

When an AI coding agent works on this repository:

1. Read this file completely before editing code.
2. Inspect the existing repository before proposing new architecture.
3. Implement only the active milestone.
4. Do not add speculative frameworks or abstractions.
5. Do not add a daemon, database, API server, or shell wrapper unless this document is amended first.
6. Prefer documented Cockpit APIs.
7. Prefer structured/machine-readable systemd output where documented and available.
8. Keep parsing outside React components.
9. Add tests for every new parser.
10. Do not silently broaden scope.
11. If a requirement conflicts with current Cockpit/systemd behavior, stop that sub-feature and document the conflict rather than inventing behavior.
12. Before finishing a milestone, audit the implementation against this file and report deviations.

Recommended first build prompt:

```text
Read IMPLEMENTATION.md completely and treat it as the architectural contract.

Inspect the repository and current Cockpit Starter Kit structure.

Implement only milestone v0.1. Before editing, produce a concise plan naming the files you expect to create or modify.

Do not implement future milestones.
Do not add a daemon or database.
Do not duplicate Cockpit Services or Logs.
Use documented Cockpit APIs and argv-based cockpit.spawn calls.
Keep command execution, parsing, typed models, and UI separated.
Add fixture-based parser tests.

After implementation, audit the result against the v0.1 Definition of Done and report any remaining gaps.
```

---

## 29. Technical references

Use current upstream documentation while implementing; do not treat this list as frozen API documentation.

- Cockpit developer guide: https://docs.cockpit-project.org/cockpit-guide/latest/guide/development.html
- Cockpit base API / `cockpit.spawn()` / `cockpit.jump()`: https://docs.cockpit-project.org/cockpit-guide/latest/guide/api-base1.html
- Cockpit packages: https://docs.cockpit-project.org/cockpit-guide/latest/guide/packages.html
- Cockpit applications: https://cockpit-project.org/applications
- Cockpit Starter Kit: https://github.com/cockpit-project/starter-kit
- `systemd-analyze(1)`: use the man page matching the target systemd release
- systemd source: https://github.com/systemd/systemd

When upstream documentation and this file disagree about an API detail, prefer current upstream behavior and update this specification deliberately rather than coding around the discrepancy.
