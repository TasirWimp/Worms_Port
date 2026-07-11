# Development Workflow

Worms_Port should move in small, auditable slices. The main engineering risk is
not only a bug; it is accidentally weakening the license/import boundary while
adding gameplay, assets, or tooling.

## Source Of Truth

Use these files to decide where a change belongs:

- `README.md` for setup, build, and high-level repo status.
- `AGENTS.md` for Codex operating rules and subagent roles.
- `docs/art-direction.md` for product identity, world, character, visual, and
  concept-art boundaries.
- `docs/import-boundary.md` for upstream source roles.
- `docs/asset-review-workflow.md` for third-party asset review.
- `docs/planning/implementation_plan.md` for current slices and role routing.
- `legal/source-manifest.json` for upstream source traceability.
- `legal/asset-manifest.json` for approved product assets.
- `legal/allowed-licenses.json` for asset license policy.
- `legal/dependency-license-overrides.json` for npm package license evidence.

## Required Development Loop

Every non-trivial change should follow this loop:

1. **Plan the slice**
   Define the intended behavior, owning role, affected files, non-goals, and
   import-boundary risk.
2. **Plan the checks**
   Decide whether to run compliance, typecheck, build, audit, smoke tests, or
   manual browser checks.
3. **Implement**
   Keep Turtle-derived code changes separate from asset review and compliance
   changes when practical.
4. **Verify**
   Run the planned checks and record results.
5. **Update docs/manifests**
   Update source, asset, attribution, planning, or workflow docs when the
   change alters repo truth.
6. **Summarize**
   Report files changed, checks run, skipped checks, and residual risk.

## Autonomous Slice Loop

For WP-005 and later, the orchestrating agent applies the required loop without
waiting for routine implementation decisions:

1. Read the execution pointer in `docs/planning/implementation_plan.md` and
   select only the named unblocked work package.
2. Record the starting commit, worktree status, affected ownership boundaries,
   dependency-lock hash when relevant, planned checks, and deterministic seeds.
3. Establish a green baseline for the selected checks. A red baseline is
   reported separately and is not attributed to the candidate patch.
4. Implement one bounded refinement in an isolated branch or worktree.
5. Run a fail-fast funnel: compliance, types, focused tests, clean build, built
   smoke, protocol/browser/visual/performance checks as applicable.
6. Ask the implementing agent to review its own change, then request the
   relevant test, compliance, asset, and read-only reviewer roles.
7. On failure, reproduce the smallest case, classify it, make one correction,
   rerun the failing check, then rerun the selected funnel.
8. Stop after three corrections for the same failure signature and report the
   blocker without weakening a threshold or guardrail.
9. Persist sanitized evidence, update source-of-truth documents, commit the
   bounded slice, and advance the execution pointer only after all gates pass.

Never auto-approve screenshot baselines, asset licenses, attribution omissions,
brand permissions, payment exceptions, security exceptions, or real-fund
activation.

## Verification Funnels

The planned scripts may evolve during WP-005, but their responsibilities are:

```text
verify:fast
  compliance -> types -> unit -> deterministic simulation

verify:runtime
  clean build -> built smoke -> protocol -> browser phone matrix

verify:full
  verify:fast -> verify:runtime -> visual -> performance -> read-only review
```

Built smoke tests must rebuild or prove that output metadata matches the current
source and lockfile. Passing against stale ignored build output is not evidence.

Browser automation covers phone-sized Chromium and WebKit, portrait and
landscape, touch input, safe areas, resize, slow/offline networking,
background/resume, fake-wallet approval/rejection, and deterministic visual
states. Real Android and iOS testing is outside the autonomous cycle. Every
completion summary must state that it was not run rather than imply device
coverage from emulation.

### Playwright Bootstrap

WP-005 must establish that Playwright works in this repository before later
work packages depend on it. Installing only the npm package or printing a
version is insufficient. Completion requires actual Chromium and WebKit
launches against a freshly built local server and a phone-sized smoke journey.

The checked-in Playwright configuration must:

- use the repository-local `@playwright/test` dependency,
- start or reuse only a test-owned server on an isolated port,
- use deterministic locale, timezone, viewport, device scale factor, and
  reduced-motion settings where visual evidence is captured,
- fail on uncaught page errors and unexpected console errors,
- assert that the Phaser canvas exists and contains nonblank pixels,
- retain trace and screenshot evidence on failure,
- keep caches, reports, videos, traces, and screenshots out of `assets/`, and
- provide Chromium and WebKit phone projects without system-browser executable
  overrides.

WP-005 provides browser launch and application smoke coverage. WP-013 expands
that foundation into the full viewport, visual-regression, network, resume,
fake-wallet, performance, and multiplayer-context matrix.

## Asset Generation Loop

Production art follows this fail-closed sequence:

```text
approved brief -> quarantined concept master -> controlled refinement
  -> animation/export -> deterministic normalization -> in-engine phone captures
  -> art/IP/provenance review -> manifest approval -> assets/ promotion
```

All Knotkin production briefs use
`docs/images/art-direction/knotkin-class-lineup-concept.png` as the canonical
visual reference. The image remains documentation-only: it cannot be cropped,
traced, or shipped directly. It may be supplied to an approved production tool
as the user-selected creative conditioning reference only when the tracked path
and SHA-256 are recorded in the generation evidence. This does not resolve
Nimiq brand or geometry rights. A brief must record all other inputs and
explicitly block Sorcerers, Worms/Team17, realistic firearms, unlicensed logos,
and recognizable third-party characters.

Built-in image generation is used for rights-safe concept masters, ComfyUI for
reproducible controlled refinement after every model component passes license
review, and AutoSprite for animation/export from an approved master. Record
prompts, negative constraints, workflow JSON and hash, seeds, model and custom
node versions and licenses, service/job IDs, parent/output hashes, postprocess
configuration, and reviewer identity.

No generated output can promote itself into `assets/`. Failed or exhausted
iterations remain quarantined.

## Clean-Room Reference Loop

Only a reference-observer role may inspect Sorcerers. It produces a
behavior-only record with observable inputs, outputs, transitions, and timing.
The implementation worker cannot access Sorcerers or its quarantine and uses
only the frozen record, the MIT Turtle base, and independent sources. A separate
reviewer may compare both sides but returns only bounded contamination findings.

The import gate is supporting evidence, not proof that GPL expression was not
copied. Completion also requires the clean-room record, implementation
declaration, similarity review, and relevant behavioral tests.

## Plan Change Protocol

If implementation shows that the plan is wrong or risky:

1. Stop expanding scope.
2. State the issue plainly.
3. Classify the risk:
   - import-boundary risk,
   - asset-license risk,
   - dependency-license risk,
   - build/runtime architecture issue,
   - gameplay/scope change,
   - test strategy gap.
4. Update the relevant source-of-truth document before or in the same commit as
   the implementation.
5. Ask the user before continuing if the change would import new GPL/unclear
   material, change the project license, or materially expand scope.

## Subagent Coordination

Use `.codex/agents/` roles as scoped workers. They coordinate through repo
artifacts:

- planning docs define work slices,
- manifests record source and license evidence,
- commits preserve reviewed changes,
- completion summaries name affected future roles.

No role may override the Turtle/Sorcerers boundary.

## Definition Of Done

A slice is done when:

- it matches the requested behavior or documented plan,
- the import boundary still passes,
- relevant manifests/docs are current,
- planned checks have run,
- `npm run build` passes for source/tooling changes,
- final reporting names remaining risks.
