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
in. Nothing about the loop is kept anywhere else: no local state file, no
log line that is not also a comment on an item. Where an item came from
never changes its path, and is preserved on every item because origin is
the first thing to slice on when the loop is tuned later.

## 1 Seed

Every source ends up as the same thing: one work item in Inbox with its
origin on it. The source decides nothing after that.

| Source | How it gets in | Origin label |
|---|---|---|
| In-app feedback form | The relay behind the form (`api/feedback.js`) mails it; the mail seeder files it with the type the sender chose. | `src:app` |
| Bug report from the app | The same form with type «Feil i appen» (error in the app) and the page snapshot attached. | `src:bug` |
| Mail | The mail seeder runs first in every run: replies to the outreach mails, anything mentioning Poengkart. One item per thread. | `src:mail` |
| The owner, through Claude Code | Said in any session; Claude files it over the Plane MCP or `tools/plane.py`. The Plane UI works too but is not the expected path. | `src:you` |
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

The owner approves a decision by moving the item to Todo. A comment on it
is read as instructions for the fix; «PR only» stops the routine at the
open PR. Nothing reaches the roadmap until the owner says so.

Every comment the routine writes starts with one fixed line,
`routine · <step> · <run id>`, then prose, then a short `key: value`
block. Readable by a person, parsable by a script.

## 3 Work

Every item in Todo takes the same steps. It makes no difference whether
the routine put it there or the owner did.

1. A git worktree on a branch named after the item (`feedback/POENG-<n>`).
2. The fix, in the pipeline or the page, never in a generated file. If
   data moved, `tools/refresh.py` is re-run.
3. `tools/test_parse.py`, `tools/test_model.py`, then `pytest`, `npm run
   typecheck`, `npm test` and the Playwright smoke `npm run e2e` on desktop,
   dark and mobile.
4. A pull request whose title carries the item id and whose body links
   back to it.
5. Merge to `main`, `vercel deploy --prod --yes`, the post-deploy checks on
   the live site (the routine file lists them).
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

Each run ends with one comment on the standing item «Feedback loop · run
log»: items seeded by source, how they were classed, what shipped, what
went red, and how long the run took.

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

- No email is ever sent by the routine.
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
the REST API; `tools/plane.py` will re-assert this on every run so a
deleted label or state comes back.

States, in order: Inbox (group backlog, the default for new items; Plane
reserves the name Triage for its Intake feature),
Needs decision (unstarted), Todo (unstarted), In Progress (started), Done
(completed), Cancelled (cancelled). Backlog stays for the owner's parked
ideas; the routine never reads it.

Labels: `src:app`, `src:bug`, `src:mail`, `src:you`, `src:routine`;
`class:auto`, `class:decision`, `class:info`; `type:tall`, `type:bilde`,
`type:skole`, `type:feil`, `type:funksjon`, `type:annet`; `fylke:<name>`
for all fifteen counties; `log` for the run-log item.

Access. Unattended: the REST API at `https://api.plane.so/api/v1/` with
`PLANE_API_KEY` and `PLANE_WORKSPACE_SLUG` from the environment (the cloud)
or `.env.local` (locally), header `X-API-Key`. The API sits behind
Cloudflare, which answers Python's default user agent with 403 error 1010,
so the adapter sends its own. Gmail: the Gmail connector the Claude account
already has, signed into the feedback mailbox, limited in the routine to
`search_threads`, `get_thread`, `get_message` and `create_draft`; no
credential for the mailbox exists in the repository or the environment.
Interactive: Plane's hosted MCP server, added at user scope in Claude Code
with OAuth; it acts as the owner and respects his project role.

## Runtime and rollout

A Claude Code cloud routine runs `routines/feedback-loop.md` twice a day,
07:15 and 19:15 Oslo time, on a clone of the repository in the same cloud
environment as the weekly source watch. The environment carries every tool
the routine needs: Python with `tools/requirements.txt`, Node with
Playwright's Chromium, the `vercel` CLI, the Gmail connector with four
tools, and the variables named under Access plus `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Pull requests are opened and merged
with the GitHub tools the cloud session already has. The same file runs
locally as `/feedback-loop`.

Week 0 is report-only: Seed, Triage and Close run, Work stops at the open
PR. From week 1 or 2 the Mode line flips to ship, and merge and deploy
switch on for `class:auto`.

## What gets built

- `tools/plane.py`: a thin REST adapter with a dry-run flag. Ensures the
  states and labels, finds an item by external id, creates, comments,
  moves state, sets labels and priority, lists a state. Used by the
  routine and callable from a shell; prints JSON.
- `tools/feedback_mail.py`: no Gmail access of its own. `query` prints the
  search the routine hands to the connector; `file` turns one thread, as
  the connector returned it, into an Inbox item or into comments for
  messages the item does not know yet.
- `routines/feedback-loop.md`: the run, step by step, with the exact
  commands and connector calls, the comment formats, the source check, the
  limits, the deploy checks and the red-step rules. Committed, so the
  cloud clone reads the same text. `.claude/skills/feedback-loop/SKILL.md`
  points at it for `/feedback-loop`.
- The cloud routine «Poengkart — feedback loop», twice daily, whose prompt
  points at the routine file and whose Gmail connector is limited to the
  four tools.
- Later: `api/feedback.js` creates the Plane item directly.
