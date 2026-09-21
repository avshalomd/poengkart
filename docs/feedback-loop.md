# The feedback loop

How a message about Poengkart becomes a work item in Plane and, when it is
an objective defect, a shipped fix. Designed 14–17 September 2026. The
picture version is the "Poengkart Feedback Loop" artifact; this file is the
spec the implementation plan is written from.

## The model

Four steps, one record.

| Step | What happens |
|---|---|
| 1 Seed | Anything becomes one work item in Plane, state Inbox, tagged with where it came from. |
| 2 Triage | The routine reads every Inbox item and picks one exit: do it, ask the owner, or close it. The reason goes on the item. |
| 3 Work | Fix, test, PR, merge, deploy, verify. The same steps whoever said go. |
| 4 Close | Done, with the outcome on the item. A Gmail reply draft if someone wrote in. |

Plane is the record. The routine reads only Plane and writes only Plane,
plus a PR and a deploy when it ships and a Gmail draft when someone wrote
in. The work items and their path across the board are the log: every
step is a comment on the item it concerns, and every move between states
carries its reason on that item. Nothing about the loop is kept anywhere
else: no local state file, and no run-log or summary item in Plane (one
existed until 21 September 2026 and was retired as a misreading of «Plane
is the log»). Where an item came from
never changes its path, and is preserved on every item because origin is
the first thing to slice on when the loop is tuned later.

## 1 Seed

Every source ends up as the same thing: one work item in Inbox with its
origin on it. The source decides nothing after that.

One item is one issue. A thread, a mail or a form submission is only how
an issue arrived; when it carries more than one (a layout fault and a
feature request in the same thread, as POENG-25 did), triage splits it
into one item per issue before classing, each with the same origin and
source line and a link to its siblings. An item moves across the board as
a unit, so a bundled item leaves its fixed half waiting on its undecided
half.

| Source | How it gets in | Origin label |
|---|---|---|
| In-app feedback form | The relay behind the form (`api/feedback.js`) mails it; the mail seeder files it with the type the sender chose. | `src:app` |
| Bug report from the app | The same form with type «Feil i appen» (error in the app) and the page snapshot attached. | `src:bug` |
| Mail | The mail seeder runs first in every run: replies to the outreach mails, anything mentioning Poengkart. One intake per thread; triage splits it by issue. | `src:mail` |
| The owner, through Claude Code | Said in any session; Claude files it over the Plane MCP. The Plane UI works too but is not the expected path. | `src:you` |
| A routine | The weekly source watch or a QA sweep files what it finds. | `src:routine` |

The form's types map onto the type labels one to one: `tall` («Feil i
tallene», wrong figures), `bilde` (photo), `skole` (school missing or
misplaced), `feil` (error in the app), `funksjon` (feature request),
`annet` (other). The relay's subject prefix `[Poengkart]` is how the mail
seeder tells a form submission from ordinary mail.

Dedupe and traceback: a machine source sets `external_source` (`gmail`,
`feedback-form`, or the routine's name) and `external_id` (the Gmail thread
id, the submission id) on the item, and the seeder looks that pair up
before creating anything. Every filed Gmail message id is written on the
item, so a later reply on a thread that already has an item becomes a
comment on that item, not a new item, and a re-run changes nothing. Gmail
itself is never written to.

Later, the relay can create the Plane item itself and keep the mail as a
notification. Nothing downstream changes; only the seeder does.

## 2 Triage

The routine reads every item in Inbox, whoever seeded it, and writes on
it: labels for class, type and county; school, programme and year in a
«Fakta» (facts) block at the top of the description when the item did not
carry them; Plane's own priority field. Then it picks one of three exits.

| Exit | Class | What qualifies | Goes to |
|---|---|---|---|
| Do it | `class:auto` | A wrong figure where the county's own document agrees with the sender. A broken, wrong or missing photo. A missing or misplaced school. A typo. A dead link. | Todo |
| Ask the owner | `class:decision` | Feature ideas, wording, layout, anything touching the model, anything with two reasonable readings. The item carries a one-paragraph recommendation and the options. | Needs decision |
| Close it | `class:info` | Praise, a question the app already answers, a county offering data. A data offer, or a sender citing a newer publication than we hold, is handed to the weekly source routine as a `src:routine` item for it. | Done |

The source check: a wrong-figure claim is compared with the county's file
under `sources/` before it can be `class:auto`. If the document agrees
with the sender it is a defect; if it agrees with the app, or is not on
hand, the item is `class:decision` with both figures quoted.

The owner decides by answering on the item; he does not have to move it.
A go («Implement it») is the go for the whole cycle: the routine plans,
fixes, tests, opens the PR, merges, deploys and QAs the live site without
stopping or coming back to ask, whatever the Mode line says. It stops
early only where he says so in the same comment («implement it, but wait
with the pull request», «PR only»). An answer that settles the item with
no code (a draft «sent» or «dropped») closes it; a no cancels it. Moving
an item to Todo by hand still works and means the same go. Nothing reaches
the roadmap until the owner says so.

Every comment the routine writes starts with one fixed line,
`routine · <step> · <run id>`, then prose, then a short `key: value`
block. Readable by a person, parsable by a script. A comment that goes
with a state change says where the item came from, where it went and why
(`moved: <from> → <to>`); no item changes state silently.

## 3 Work

Every item in Todo, and every Needs decision item the owner has said go
on, takes the same steps. The only difference is the Mode line, which
holds `class:auto` items at the open PR during week 0 and never holds an
item the owner approved.

1. A git worktree on a branch named after the item (`feedback/POENG-<n>`).
2. The fix, in the pipeline or the page, never in a generated file. If
   data moved, `tools/refresh.py` is re-run.
3. `tools/test_parse.py`, `tools/test_model.py`, then `pytest`, `npm run
   typecheck`, `npm test` and the Playwright smoke `npm run e2e` on desktop,
   dark and mobile.
4. A pull request whose title carries the item id and whose body links
   back to it.
5. Merge to `main`, `vercel deploy --prod --yes`, the post-deploy checks on
   the live site (the routine file lists them), and a look at the change
   itself where a reader meets it, phone width included.
6. Each step is a comment on the item, with the link it produced.

Limits: at most three items per run, one deploy per run. A red step stops
the lane: the PR stays open, the item goes back to Needs decision with the
log, nothing is merged or deployed. A failed post-deploy check rolls back
to the previous deployment.

## 4 Close

An item is Done when the outcome is on it: what changed, the PR, the
deploy, or the reason nothing was needed. For an item with a sender the
routine writes a reply draft in Gmail, in Norwegian, and puts the English
beside it in a comment on the item. The routine never sends mail; every
draft is the owner's to send or drop.

The person who wrote in is never a participant of the work item: not a
Plane member, guest, subscriber, mention or Cc. Nothing automatic reaches
them. They hear back only through a reply the owner sends from his own
mailbox, when there is something worth telling them.

A run as a whole leaves nothing in Plane. Its one-line result is the
session's final message; what happened to each item is on that item.

## What Plane records

On every item: the origin (`src:`), the class (`class:`), the type
(`type:`), the county (`fylke:`), the priority, the state timeline that
Plane keeps on its own (seeded, triaged, decided, started, done), and one
routine comment per step with the reason, the source-check result, the
PR, the QA result, the deploy and the reply draft.

Questions this can answer later, from the API alone:

- Which sources produce items that ship, and which produce noise.
- How long from seed to Done, per class and per source.
- How often the owner overturns the routine's class, and on what kind of
  item. That is the training signal for the classifier.
- Which counties and schools generate the most defects, which points at
  the data pipeline rather than at the feedback.

## Guardrails

- No email is ever sent by the routine, and no sender is ever attached
  to a work item in a way that would make Plane or GitHub mail them.
- No run-log, journal or summary item in Plane; no state change without
  its reason on the item.
- No item holding more than one issue.
- Plane is written in English only: the owner cannot read Norwegian. A
  Norwegian mail is quoted with its full English translation after it; a
  Norwegian reply draft is paired with its English version, English first.
- No change to `tools/model.py` or the fit.
- Generated files (`web/public/data/*`, `data/*`) are never edited by
  hand; the pipeline is fixed and re-run.
- Any red step: PR stays open, item back to Needs decision, no merge, no
  deploy.
- Deploy verification fails: rollback to the previous deployment.
- Plane, Gmail or GitHub unreachable: the run ends with a note and changes
  nothing.

## Plane

Workspace `poengkart`, project POENG. Set up on 17 September 2026 through
the REST API; the routine re-creates a missing state or label under the
same name, and never invents a new one.

States, in order: Inbox (group backlog, the default for new items; Plane
reserves the name Triage for its Intake feature),
Needs decision (unstarted), Todo (unstarted), In Progress (started), Done
(completed), Cancelled (cancelled). Backlog stays for the owner's parked
ideas; the routine never reads it.

Labels: `src:app`, `src:bug`, `src:mail`, `src:you`, `src:routine`;
`class:auto`, `class:decision`, `class:info`; `type:tall`, `type:bilde`,
`type:skole`, `type:feil`, `type:funksjon`, `type:annet`; `fylke:<name>`
for all fifteen counties.

Access. Plane: the official hosted Plane MCP server, declared once in
`.mcp.json` at the repository root (`https://mcp.plane.so/http/api-key/mcp`,
the access-token endpoint) with `PLANE_API_KEY` and `PLANE_WORKSPACE_SLUG`
expanded from the environment: the cloud environment's variables, or
`.env.local` exported into a local session. The same declaration serves the
cloud routine and a local session, so there is no adapter of our own; the
session works with the server's `workitem`, `workitem_comment`, `state` and
`label` tools directly, and `external_source`/`external_id` on a work item
carry the dedupe. Gmail: the Gmail connector the Claude account already has,
signed into the feedback mailbox, limited in the routine to `search_threads`,
`get_thread`, `get_message` and `create_draft`; no credential for the
mailbox exists in the repository or the environment.

## Runtime and rollout

A Claude Code cloud routine runs `routines/feedback-loop.md` twice a day,
07:15 and 19:15 Oslo time, on a clone of the repository in the same cloud
environment as the weekly source watch. The environment carries every tool
the routine needs: Python with `tools/requirements.txt`, Node with
Playwright's Chromium, the `vercel` CLI, the Gmail connector with four
tools, `mcp.plane.so` among the allowed domains (a server declared in
`.mcp.json` talks to its host from the session, unlike a connector), and
the variables named under Access plus `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`. Pull requests are opened and merged with the GitHub
tools the cloud session already has. The same file runs locally as
`/feedback-loop`.

Week 0 is report-only for `class:auto`: Seed, Triage and Close run, and
Work on those items stops at the open PR. From week 1 or 2 the Mode line
flips to ship, and merge and deploy switch on for `class:auto`. Items the
owner said go on ship from day one.

## What gets built

- `.mcp.json`: the Plane MCP server, with the key and workspace slug as
  environment references. No code of our own sits between the session and
  Plane; what the routine must record is written as rules, not as a script.
- `routines/feedback-loop.md`: what a run must achieve, step by step —
  the mail query and the noise rule, the dedupe by thread id, the class
  table and the source check, the comment formats, the limits, the deploy
  checks, the reply-address rule and the Never list. How the session gets
  there (which commands, which tool calls) is left to it. Committed, so the
  cloud clone reads the same text. `.claude/skills/feedback-loop/SKILL.md`
  points at it for `/feedback-loop`.
- The cloud routine «Poengkart — feedback loop», twice daily, whose prompt
  points at the routine file and whose Gmail connector is limited to the
  four tools.
- Later: `api/feedback.js` creates the Plane item directly.
