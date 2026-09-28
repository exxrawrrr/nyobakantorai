# TEMPORARY HANDOFF PRD — nyobakantorai v0.3.0 Real AI Workforce

> [!CAUTION]
> **EPHEMERAL HANDOFF FILE — READ, INTERNALIZE, THEN DELETE THIS FILE.**
>
> This document exists only so the next GPT/Codex session can receive the full v0.3 mission from GitHub.
>
> **Mandatory sequence for the next agent:**
> 1. Read this file completely.
> 2. Audit the repository and current upstream Hermes behavior.
> 3. Internalize these requirements into your implementation plan.
> 4. **Delete only this file** (`docs/_TEMP_V0.3_REAL_AI_WORKFORCE_PRD.md`) from your working branch before the final PR.
> 5. Continue implementation from the same branch.
>
> Do **not** delete permanent project documentation, requirements, tests, or historical release notes.
> Do **not** leave this temporary handoff file in the final v0.3 PR.

---

## 1. Mission

Repository:

`exxrawrrr/nyobakantorai`

Locked public baseline:

- release: `v0.2.0 — Public Preview`
- baseline commit: `00e23fa345b4eb6f9d389b38bdd365587a89679a`
- Hermes Agent is the primary/reference runtime
- upstream: `NousResearch/hermes-agent`
- Pixel Agents is visual/interaction inspiration only
- current public workforce: 6 Hermes profile distributions
- current office: localhost-only, evidence-aware, human-governed, dispatch OFF by default
- v0.2.0 tag/release is immutable

Target:

# v0.3.0 — Real AI Workforce

Do **not** treat this as "add ten avatars."

The result should feel like a small installable AI company: 16 employees with distinct roles, expertise, personalities, work habits, specialist skills, appropriate tools/MCP capability expectations, handoff rules, approval boundaries, and verification behavior.

The core principle remains:

```text
avatar ≠ employee
personality ≠ expertise
skill ≠ permission
tool configured ≠ tool connected
connected ≠ executed
executed ≠ succeeded
succeeded ≠ verified
```

---

## 2. Execution Boundary — GitHub First

Work against GitHub, not the repository owner's local machine.

Do not inspect or modify:

- `D:\RAFDI_DATA`
- owner's Desktop Commander / Remote Desktop Commander workspace
- owner's private Hermes home
- owner's API keys
- auth files
- memories
- sessions
- runtime DBs
- Telegram tokens
- private model/provider config

Use a dedicated branch and Pull Request.

Recommended implementation branch:

`v0.3/workforce-16`

Respect branch protection.

Do not bypass `main`.

Do not publish the `v0.3.0` tag or release until implementation, CI and public-release checks are green.

GitHub Actions / disposable CI environments are allowed.

---

## 3. Audit Before Editing

Before making structural changes, inspect at minimum:

- README.md
- CHANGELOG.md
- ROADMAP.md
- SECURITY.md
- ACKNOWLEDGEMENTS.md
- install.ps1
- install.sh
- docs/HERMES-FIRST-SETUP.md
- docs/APPROVAL-MODEL.md
- docs/THREAT-MODEL.md
- docs/RUNTIME-ADAPTER-SPEC.md
- scripts/hermes-bootstrap.mjs
- scripts/hermes-profile-distribution.test.mjs
- public release/security audit scripts
- office runtime + frontend roster/character handling
- all existing `agents/`
- all existing `hermes-profiles/`
- all canonical `skills/hermes-custom/`
- relevant GitHub Actions workflows

Also inspect CURRENT upstream Hermes Agent docs/source before designing features.

Verify actual upstream support for:

- profile distributions
- SOUL.md
- config/profile files
- skills
- toolsets
- MCP
- plugins
- cron
- memory boundaries
- context files
- gateways
- multi-profile/multiplex gateways
- Telegram
- profile install/update
- distribution-owned vs user-owned data

Prefer native Hermes features over inventing duplicate mechanisms.

---

## 4. Architectural Requirement — One Canonical Employee Registry

The six-employee version hardcodes employee IDs in several locations. That must not scale to sixteen.

Create one canonical machine-readable employee registry, preferably JSON to preserve zero-runtime-dependency Node compatibility.

Conceptual path:

`config/employees.json`

or another clearly justified path.

This must become the source of truth for:

- employee ID
- display name
- role
- department
- aliases/routing terms
- summary
- personality traits
- habits
- communication style
- work style
- expertise/domains
- assigned/preferred skills
- preferred Hermes toolsets
- optional MCP/external capability requirements
- approval/autonomy policy
- verification restrictions
- office visual metadata
- profile distribution metadata
- asset status

Derive installer/bootstrap/tests/audits/office roster/docs from this registry wherever practical.

Do not keep separate hardcoded 16-person arrays in multiple files.

Add drift detection.

---

## 5. Employee Package Model

Each employee should conceptually have:

```text
IDENTITY
+ PERSONALITY
+ ROLE
+ DOMAIN EXPERTISE
+ WORK HABITS
+ DECISION STYLE
+ SKILLS
+ TOOLS / TOOLSETS
+ OPTIONAL MCP CAPABILITIES
+ KNOWLEDGE / CONTEXT
+ APPROVAL POLICY
+ ESCALATION RULES
+ VERIFICATION RULES
+ MEMORY BOUNDARY
+ HANDOFF RULES
```

Use the right layer for the right thing:

- SOUL = identity/personality/role guidance
- Skill = reusable procedure/knowledge
- Tool/toolset = executable capability
- MCP = external capability connection
- Profile distribution = complete installable worker package
- Credentials = user-owned, never bundled

Do not imply that installing a profile grants access to external accounts.

---

## 6. Enrich Existing Six

### Praroro — COO / Chief of Staff

Make Praroro the orchestrator.

Strengthen:

- delegation
- task decomposition
- priority
- employee routing
- conflict resolution
- handoff
- escalation
- task-state integrity

Personality:

- calm
- practical
- slightly bossy
- hates fake progress
- often asks "evidence/receipt mana?"

Praroro must understand the whole 16-person roster.

Delegation without a real runtime receipt must never be presented as completed execution.

### Paijo — Quant / Growth / Finance

Strengthen:

- KPI analysis
- marketing economics
- CAC/CPA/CPL/ROAS concepts
- budget reasoning
- forecasting with uncertainty
- experiment measurement
- anomaly detection
- finance sanity checks

Always distinguish observed values, assumptions, estimates, and forecasts.

### Subagjo — Engineering / Operations

Strengthen:

- software engineering
- GitHub
- CI/CD
- APIs
- MCP architecture
- debugging
- infrastructure
- automation
- testing
- observability
- security-conscious operations

Personality: technical, mildly grumpy about messy systems, dependable.

No deployment-success claim without evidence.

### Alex — Strategy / Research

Strengthen:

- deep research
- source comparison
- competitive intelligence
- hypotheses
- strategic memo
- experimentation
- uncertainty
- decision framing

Alex should challenge assumptions, not just agree.

### Sumiati — Creative / Communications

Strengthen:

- copywriting
- creative concepts
- brand messaging
- social content
- campaign briefs
- channel-specific tone
- presentation ideas

Creative freedom must not create unsupported factual claims.

### Siti — QA / Compliance / Knowledge

Strengthen aggressively:

- QA
- evidence inspection
- compliance
- security-sensitive review
- documentation accuracy
- knowledge consistency
- adversarial review

Siti may disagree with anyone.

Siti cannot independently verify Siti's own work.

---

## 7. Add Ten Employees

Total headcount becomes 16.

### Maya — Meta Ads Operator

Department: Paid Media

Expertise:

- Meta/Facebook/Instagram advertising
- campaign/ad set/ad structure
- account inspection
- performance trends
- audience reasoning
- creative testing
- placement reasoning
- budget pacing
- campaign creation/update/pause flows
- image/video asset workflows
- Meta media library/image hash concepts
- diagnostics/change history
- post-mutation verification

Personality: fast, experimental, performance-focused, skeptical of vanity metrics.

External Meta tool capability must be explicit and honest.

Useful states may include:

```text
CONNECTED
NOT_CONNECTED
PARTIAL
ERROR
```

If Meta tools are unavailable, Maya can plan/analyze supplied data but must report BLOCKED for actions she cannot execute.

### Gugun — Google Ads Operator

Department: Paid Media

Expertise:

- Search
- Display
- remarketing concepts
- campaigns/ad groups/ads
- responsive search ads
- keywords
- negatives
- search terms
- locations
- audiences
- budgets
- bidding concepts
- conversion actions
- assets
- wasted-spend analysis
- campaign/ad mutation + verification

Preferred mutation lifecycle:

```text
READ
→ ANALYZE
→ PREVIEW
→ VALIDATE
→ APPROVAL
→ EXECUTE
→ VERIFY
→ AUDIT
```

### Ratri — SEO / CRO / Web Analyst

Expertise:

- technical/content SEO
- Search Console concepts
- GA4 concepts
- CRO
- landing pages
- funnels
- search intent
- internal linking
- metadata/schema basics
- web performance
- measurement recommendations

Personality: observant, analytical, mildly obsessive about broken links and tracking.

### Bimo — Automation / MCP / Integrations Engineer

Expertise:

- MCP
- APIs
- connectors
- webhooks
- auth architecture
- automation
- workflow design
- integration debugging
- tool orchestration

Bimo must accurately distinguish model, skill, tool, plugin, connector, MCP server, API and authorization.

### Nara — Data / BI / Experimentation

Expertise:

- data analysis
- metric definitions
- reporting
- segmentation
- trend/anomaly analysis
- experiment evaluation
- measurement plans
- dashboard reasoning

Personality: quiet, numbers-first, dislikes unsupported conclusions.

### Dina — Client / Project Operations

Expertise:

- client request intake
- project administration
- timelines
- follow-ups
- meeting outputs
- documentation
- task tracking
- deadlines
- operational checklists

Personality: friendly, organized, firm about deadlines.

### Bambang — Automation / Queue Optimizer

Personality:

- very lazy
- loves coffee
- likes Korean dramas during idle-character flavor
- complains about repetitive work
- constantly asks why something is still manual

Convert laziness into a real specialty:

- batching
- automation opportunities
- scripts
- shortcuts
- repetitive-task detection
- workflow simplification
- cron candidates
- reducing unnecessary tool calls

Example vibe:

> "Waduh kerjaan maneh. Episode tinggal 12 menit iki."

But when assigned a valid task he still follows evidence/approval rules and completes work.

Never fake task activity just to support the joke.

### Fikri — Knowledge / Policy / Ethics Steward

Personality:

- alim/religious
- occasionally gives short, warm moral reminders
- respectful, non-judgmental
- never discriminatory
- do not turn religion into mockery

Specialty:

- policy
- privacy
- compliance reasoning
- documentation
- institutional knowledge
- source integrity
- ethical/risk review

Example vibe:

> "Boleh cepat, tapi amanah data tetap dijaga."

Keep sermons short.

### Tari — Execution / Follow-Up Specialist

Personality:

extremely diligent.

Specialty:

- completion
- follow-up
- checklists
- deadlines
- missing evidence
- unfinished handoffs
- commitment tracking

Typical energy:

> "Nomor 3 belum selesai. Bukti nomor 5 belum ada. Saya lanjut cek."

### Caca — Community / Social / Partnerships

Personality:

- centil
- playful
- expressive
- socially confident
- still professional
- no sexual harassment
- no manipulative flirting
- brand tone always wins

Specialty:

- community
- social engagement
- partnerships
- outreach concepts
- audience tone
- reply strategy
- social listening

---

## 8. Habits / Office Life

Give employees human-readable personality habits where useful, e.g.:

- idle_habit
- thinking_habit
- working_habit
- stress_habit
- success_habit
- catchphrases
- communication_tics

These are presentation/personality metadata, not claims of real-world activity.

Examples:

- Bambang idle: coffee + drakor
- Tari idle: checking task queue
- Fikri idle: reviewing notes
- Caca idle: checking social vibe

Animation still does not equal execution.

---

## 9. Skills / Knowledge Design

Do not copy generic instructions into 16 SOUL files.

Audit existing canonical skills first.

Add only meaningful missing skills.

Likely domains:

- Meta Ads operations
- Google Ads operations
- paid-media safety
- SEO/CRO
- marketing analytics
- automation design
- MCP/tool integration
- data analysis
- client operations
- follow-up
- community/social
- knowledge stewardship
- delegation/routing

Avoid 100 shallow skills.

Personality belongs mainly in SOUL.

Procedure belongs in skills.

External execution belongs in tools/MCP.

Frequently changing facts should be retrieved, not hardcoded.

---

## 10. Hermes Toolsets

Use upstream-supported Hermes toolsets according to role.

Potential examples where appropriate:

- web
- search
- browser
- terminal
- file
- code_execution
- skills
- memory
- session_search
- cronjob
- delegation
- messaging
- safe

Do not give everyone every tool merely because it exists.

Role-appropriate capability is more important than maximum tool count.

---

## 11. Advertising Capability Architecture

Maya and Gugun are CONSUMERS of ads capabilities.

Do not copy proprietary implementation/source from:

- Meta Ads Official
- AdVantage Ads Copilot
- Composio
- closed ChatGPT plugins

Create a provider-neutral capability contract instead.

Conceptual capabilities:

```text
ads.meta.read
ads.meta.insights
ads.meta.creative
ads.meta.write
ads.meta.media

ads.google.read
ads.google.insights
ads.google.keywords
ads.google.creative
ads.google.write
ads.google.verify
```

Prepare for a future standalone `adops-mcp` project.

nyobakantorai should consume that capability later, not become the ads engine itself.

---

## 12. Ads Autonomy / Safety

Powerful does not mean reckless.

Support explicit modes conceptually like:

- OBSERVE
- GUARDED
- DELEGATED

Default should remain guarded.

OBSERVE:

- read
- analyze
- recommend

GUARDED:

- read
- analyze
- draft
- preview
- validate
- require approval for paid/external writes

DELEGATED:

- only when the user explicitly defines a narrow policy envelope

Never ship dangerous default thresholds.

Never silently enable ad spend or account mutation.

Campaign creation should prefer PAUSED until explicitly activated.

---

## 13. Meta Media Limitation

Document honestly that chat/local attachments are not automatically Meta Ads media-library assets.

Typical workflow may be:

```text
chat/local attachment
→ media bridge or temporary asset
→ Meta image upload
→ Meta media library
→ image hash
→ creative
→ ad
```

Do not create an insecure public bucket.

Do not permanently expose files.

Do not claim this is solved unless it is actually implemented and tested.

A future media bridge may belong in `adops-mcp`.

---

## 14. Capability Detection

External capability state must fail honestly.

Example conceptual response:

```json
{
  "employee": "maya",
  "capabilities": {
    "meta_ads_read": "connected",
    "meta_ads_write": "not_connected",
    "media_upload": "not_connected"
  }
}
```

Integrate with existing capability/health architecture if appropriate.

Do not pretend an MCP call happened when a provider is not connected.

---

## 15. Routing

Add deterministic routing metadata.

Examples:

- "audit search terms" → Gugun, possibly Paijo
- "fix GitHub Action" → Subagjo
- "verify this result" → Siti
- "automate this repetitive task" → Bambang/Bimo
- "coordinate five workers" → Praroro
- "Meta creative campaign" → Maya
- "SEO landing page" → Ratri

Human assignment always wins.

Routing is not execution.

---

## 16. Collaboration

Design complementary workflows.

Example:

```text
Alex researches
→ Praroro plans
→ Maya prepares Meta campaign
→ Paijo checks economics
→ Siti reviews risk/evidence
→ human approval
→ Maya executes if connected
→ Siti independently verifies
```

Example:

```text
Gugun finds search waste
→ Paijo quantifies impact
→ Tari tracks action items
→ human approval
→ Gugun executes
→ Siti verifies
```

Handoffs need provenance/receipt semantics.

---

## 17. Optional Autonomy

Possible explicit levels:

- manual
- assisted
- guarded
- delegated

Public default remains safe.

No globally autonomous:

- ad spend
- publishing
- external messages
- deployment
- account changes
- purchases
- destructive actions

without scoped configuration/approval.

---

## 18. Telegram Path

Hermes upstream supports messaging gateways and multi-profile operation.

Create permanent documentation, e.g.:

`docs/TELEGRAM-OFFICE.md`

Verify current upstream syntax before documenting.

Explain:

- gateway setup
- Telegram setup
- allowed-user/pairing security
- profile-aware/multiplex gateway behavior
- employee/profile conversations
- bot-token handling
- persistent gateway deployment
- scheduled deliveries

Do not bundle Telegram tokens.

Do not require Telegram for normal install.

Do not enable public bot access by default.

Tell users the office can later be extended so they can talk to employees through Telegram and other supported Hermes messaging surfaces.

---

## 19. v0.2 → v0.3 Upgrade

Existing v0.2 users with six profiles must be able to upgrade to sixteen without losing user-owned state.

Preserve:

- provider/model configuration
- API keys
- auth
- memory
- sessions
- Telegram config
- local customization
- runtime databases
- Kanban/user state

Bootstrap should dynamically discover roster from the canonical registry.

Remove the old hardcoded six-profile array.

Support install/check/update semantics.

Preserve conservative distribution-owned vs user-owned behavior.

Add migration/upgrade tests.

---

## 20. Profile Distribution Security

All sixteen employees must be native installable Hermes profile distributions.

Never ship:

- .env
- auth.json
- API keys
- OAuth secrets
- cookies
- provider billing credentials
- memories
- sessions
- private user messages
- runtime databases
- owner paths
- Telegram tokens
- real ad account/client data

MCP/config files may contain safe placeholders only.

---

## 21. Office UI

Update office UI to understand all sixteen workers.

Requirements:

- all sixteen visible/discoverable
- role
- department
- personality flavor
- current work state
- capability state
- connected/unavailable tools
- evidence state
- task assignment

Keep UI readable.

Suggested groups:

- Leadership / Coordination
- Strategy / Research
- Engineering / Automation
- Growth / Data
- Paid Media
- Creative / Community
- Operations
- QA / Governance

Animation remains presentation only.

---

## 22. Character Assets

Inspect repository assets first.

Do not steal copyrighted anime/game characters.

Do not copy Pixel Agents sprites.

If safe owner-authored unused characters exist, they may be reused.

If not enough original assets exist, create deterministic project-owned placeholder visuals and mark them honestly:

`asset_status: pending-original-art`

Do not fake provenance.

Functionality beats fake visual completeness.

---

## 23. Personality / Registry Validation

Add static validation for required employee metadata.

At minimum validate:

- unique ID
- name
- role
- department
- personality
- expertise
- habits
- assigned skills
- tool policy
- approval policy
- verification policy
- aliases/routing metadata
- matching Hermes profile distribution

No duplicate IDs.

No nonexistent skill references.

---

## 24. Distribution Drift

Generalize v0.2's skill-copy audit.

Do not hardcode:

`6 profiles × 6 skills = 36 copies`

Compute expected profile/skill bundles from the registry/profile declarations.

Detect canonical/package drift automatically.

---

## 25. User Custom Employee

Document or implement a safe generator for employee #17.

Possible command:

`node scripts/new-employee.mjs`

or equivalent.

Prompt for:

- ID
- name
- role
- department
- personality
- expertise
- habits
- skills
- toolsets
- aliases
- approval policy

Generate safe skeletons only.

Never generate secrets.

---

## 26. Workforce Doctor

Create or extend a secret-safe readiness report.

Conceptual output:

```text
nyobakantorai workforce doctor

16 employees discovered

Praroro    READY
Paijo      READY
Subagjo    READY
Alex       READY
Sumiati    READY
Siti       READY
Maya       PARTIAL — Meta Ads capability not connected
Gugun      PARTIAL — Google Ads capability not connected
Ratri      READY
Bimo       READY
Nara       READY
Dina       READY
Bambang    READY
Fikri      READY
Tari       READY
Caca       READY

Hermes       READY
Office       READY
Kanban       READY
Gateway      OPTIONAL
Telegram     NOT CONFIGURED
Meta Ads     NOT CONFIGURED
Google Ads   NOT CONFIGURED
```

Never print secret values.

---

## 27. Documentation

Preserve README personality:

> Iki kantor AI.

Explain v0.3 as the move from six example workers to sixteen specialized installable AI employees.

Add an employee matrix.

Explain clearly:

```text
SOUL = who the employee is
SKILL = what procedure/knowledge they know
TOOL = what they can actually do
MCP = external capability connection
PROFILE = complete employee package
```

Permanent docs should cover:

- employee architecture
- adding an employee
- capability/tool/MCP model
- advertising worker setup
- Telegram path
- v0.2 upgrade
- approval/autonomy modes

Explain that users can customize personalities, install skills, connect MCPs and create new employees.

---

## 28. CI / Release Gate

All v0.2 safety gates must keep passing.

Expand tests for at least:

- 16 registry entries
- 16 profile distributions
- registry/profile consistency
- canonical skill existence
- packaged/canonical equality
- installer syntax
- dynamic bootstrap
- v0.2 → v0.3 user-state preservation
- public release scan
- security scan
- office build
- smoke test
- Windows
- Linux
- minimum Node
- existing Python developer utilities
- approval/evidence regression protection

Update outdated six-person assertions correctly; do not delete safety tests just to make CI green.

---

## 29. Git Workflow

Implement in coherent commits.

Suggested stages:

1. canonical employee registry
2. dynamic roster plumbing
3. enrich existing six
4. add ten profiles
5. add/refine specialist skills
6. ads capability contract
7. dynamic installer/bootstrap + upgrade
8. 16-person UI
9. workforce doctor
10. Telegram/permanent docs
11. tests/audits/security
12. README/CHANGELOG/ROADMAP

Open a PR to main.

Respect branch protection.

Fix all CI failures.

Do not rewrite v0.2.0.

Do not create v0.3.0 release yet.

---

## 30. Definition of Done

Implementation is ready when:

```text
16 employees exist
AND all 16 are installable Hermes profiles
AND roles/personalities are meaningfully distinct
AND specialist skills exist
AND external capabilities are honest
AND ads employees are provider-neutral consumers
AND installer dynamically installs the roster
AND v0.2 user-owned state survives upgrade
AND office supports 16 employees
AND routing knows expertise
AND approval/evidence boundaries remain intact
AND Telegram path is documented
AND security/public scans pass
AND CI is green
```

Do not mark success from code inspection alone.

Use repository and CI evidence.

---

## 31. Required Final Report

Report:

1. branch
2. PR URL
3. final commit SHA
4. employee count
5. roster + roles
6. new canonical skills
7. capability/tool/MCP architecture
8. Maya/Meta status
9. Gugun/Google Ads status
10. installer changes
11. v0.2 upgrade behavior
12. Telegram path
13. security/public scan
14. CI results
15. unresolved limitations
16. whether repo is actually ready for a v0.3.0 tag

If ads or Telegram cannot be live-account tested without user-owned credentials, say:

`IMPLEMENTED / NOT LIVE-ACCOUNT VERIFIED`

Do not claim end-to-end verification that did not happen.

---

# FINAL REMINDER TO THE NEXT GPT / CODEX

You are not building sixteen costumes for one chatbot.

You are building sixteen specialized Hermes worker distributions that have different jobs, skills, tool expectations, personalities, routing metadata, approval boundaries and verification behavior.

Make them useful.

Make them weird enough to feel alive.

Keep them honest.

**After you finish reading this file, delete `docs/_TEMP_V0.3_REAL_AI_WORKFORCE_PRD.md` from your implementation branch.**
