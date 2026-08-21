# Workflows

> **Current package identity.** This note is the original product-idea source, not the current runbook. The installable product is `@zaalipro/dsh-workflows`. `/workflow` and `/create-workflow` are Host commands; **`/workflows` is a Client-owned browser action** and is never a Host command. See `README.md` and `docs/user-guide.md`.

This is how workflows should work in SwarmCode. It is the same idea as Grok Build: a host-run, deterministic pipeline of agents. It is not an implementation plan, not a UI spec, and not a scripting-language reference.

SwarmCode already has chat turns, `/swarm`, slash-command prompt templates, and a conversation goal. Workflows are a fourth kind of work. They should not be folded into any of those.

---

## What a workflow is

A **workflow** is a named, reusable program that the **host** runs. The program orchestrates agents: it decides who runs, in what order, with what instructions, under what limits, and what happens to their answers. Agents do judgment (read the code, review a finding, write a report). The workflow decides control flow.

A workflow is not “the assistant thinking hard with extra helpers.” The chat model is not in charge of the pipeline while the workflow is running. The host is. That is the whole point: the same pipeline runs the same way tomorrow, with the same phases, the same fan-out, the same verification gates, and the same budget.

Three nouns stay distinct:

| Noun | What it is |
| --- | --- |
| **Definition** | The saved workflow. A name, a description, optional phase titles, and the program. This is what you author and reuse. |
| **Run** | One launch of a definition (or of a one-off script). It has a session-unique display name, a frozen copy of the program and args, a budget, a journal of completed host calls, a current phase, and a result. |
| **Agent** | A child session the workflow spawned. It has its own context, tools, and (optional) structured output. It does not run the workflow, and it cannot start another workflow. |

A definition can be launched many times. Each launch is a new run. Editing a definition never rewrites a run that already started.

---

## What a workflow is not

**Not a chat turn.** A chat turn is one assistant in the conversation, using tools, talking to the user. A workflow is a background pipeline. Launching it returns immediately. The user can keep using the conversation. When the run finishes, its result is posted back.

**Not `/swarm`.** A swarm is one Lead agent improvising a decomposition *this time*: inspect, spawn children, integrate, report. Useful for a one-off task. The Lead can change its mind, skip a check, or spawn the wrong number of children. A workflow does not improvise the pipeline. The pipeline is the program. Agents fill in the slots the program opens.

**Not a slash-command template.** Existing custom commands are prompt text sent to the current assistant (`$ARGUMENTS` filled in). They do not spawn a host-run pipeline, do not fan out in parallel under a budget, and do not have a run journal. A saved workflow *does* become invocable by name (for example `/review-changes`), but the thing that starts is a run, not a chat prompt.

**Not a skill / instruction pack.** A skill teaches the assistant how to do a kind of task when it comes up. A workflow *is* the task, executed by the host. `/create-workflow` is itself a skill-like procedure: the assistant authors a workflow with the user. Once saved, the workflow no longer depends on the assistant remembering the procedure.

**Not `/goal`.** A goal is an objective hanging on the conversation: keep working toward this. A workflow is a bounded program with a start, phases, a budget, and `complete`. Goals and workflows can coexist; they are not the same mechanism.

---

## Core principles

### The host runs the program

The workflow engine is part of the app, not part of the model. It steps the program. Every call it makes — spawn one agent, spawn a parallel panel, wait for the user, finish — is a host call. The model inside a child agent does not get to rewrite the pipeline, raise its own budget, or launch another workflow.

Talk about these programs as **workflows**, not as whatever language they are written in.

### Agents judge; the program decides

Child agents are untrusted at the control-flow layer. A scanner told “only look under `lib/`” will still report whatever it found. Every scoping rule, every “this counts as evidence,” every “this finding is confirmed” has to be a check *in the program* on the agent’s output, not just wording in the prompt.

Prompts to child agents must be self-contained. A child does not inherit the parent conversation. “Count the TODOs” with no order to actually search the tree will come back empty. The program is also responsible for what a valid empty answer requires (“an empty list is valid only after you have searched”).

### Parallel is a barrier

The only concurrency is a **panel**: a list of agent jobs started together. Nothing after that panel runs until the slowest job in it finishes. There is no racing, no streaming a panel’s results into the next step, no “first one to finish wins.”

Failed slots in a panel are empty. The program must guard every result (`present`, `success`, expected fields). For a proof gate, an empty or failed slot is *not confirmed* — it is not silently dropped from the denominator.

A panel is admitted as one unit against the run’s agent budget. If the panel would cross the remaining budget, none of its new children launch.

### Phases are labels for progress, not a second language

The program marks **phases** (“Review”, then “Verify”). The run dashboard groups the agents that follow a phase mark under that title. Phase titles listed on the definition should match the marks in the body so the dashboard stays in step. Nothing else enforces the match; a typo just makes the progress view lie.

### Structured output is a contract, not a hope

An agent can be required to return an object that matches a schema (a list of `{file, issue}`, a `{real, reason, evidence}` verdict, and so on). The host validates that object. Schema-correction retries do **not** spend extra budget. The program then treats the object as data: merge lists, filter, shard the next panel from them.

### The result is explicit

The program ends a successful run by **completing** with a value (a summary, a list of confirmed findings, a path to a report). That value is the run result. Reports meant for the user are written to the run’s scratch space and included in that result so the conversation can show them.

The program can also **pause** (a condition a resume cannot fix, such as missing required args) or **await the user** (a human gate: resume and the program continues past it). Prefer few gates. Interrupt only when the answer would materially change the rest of the run. Pause kinds name *why* the run is waiting (missing input, verification blocked, infrastructure, backoff, no progress).

`complete`, await-user, and pause are terminal for that step — they are not “errors the program catches.”

### Definitions live in scopes; runs live in the session

- **Built-in** — shipped with the app. Highest name priority.
- **Project** — this repo, shareable with teammates. Default when you are inside a project. Wins over user.
- **User** — available in every project. Lowest priority.

Names are lowercase letters, digits, and hyphens (`review-changes`). Discovery keys off the definition’s name, so the filename should match. Keep names unique across scopes: a built-in shadows a project name, a project name shadows a user name.

A saved definition is invocable by that name. `/workflows` is **not** the catalog of those names. The catalog is the set of saved definitions (and they also appear as named commands once saved). The dashboard is the set of runs.

### A run has a display name, not a user-facing ID

Each launch gets a **session-unique display name**: `review-changes`, then `review-changes-2` if you launch it again. That is the handle the user sees and the handle they pass to pause / resume / stop. Internal run IDs stay internal.

A numbered handle is a *run*, not a reusable definition name. Saving from a numbered handle (or from a known built-in) requires picking a new unique definition name and saving the edited copy explicitly.

### Agent budget is a count of agents, not tokens

A run has an absolute cap on **logical child-agent calls**. Default 128; allowed range 1–1,024. Every live single-agent spawn and every item in a parallel panel spends one slot *before* launch. Schema-correction retries do not. Replaying a journaled call on resume does not.

Separately, the host caps how many children of one run are live at once (32 by default). A larger panel still launches; extra jobs queue; the panel is still a barrier.

Named launches from the composer use the default budget. A model-launched run may set an explicit cap. A panel that would exceed what remains is rejected before any of its new children start. Size earlier panels with headroom if a later synthesis or verification panel still needs to run.

### Control flow is deterministic, and resume is journaled

The program’s branches may depend only on **args** and on **host-call results**. Wall-clock time and randomness are not available. If the run needs “today,” pass it in through args. Vary parallel prompts by index, not by chance.

The **journal** stores a host-call result only after that call returns. Resuming a paused run *in the same process* reuses committed results and continues with live calls under the original, immutable script, args, and cap.

Consequences the user should feel:

- To change the program, edit it and **launch a new run**. Resume never takes a new script or new args.
- A run that was active when the app process died comes back as terminal **Interrupted**, not resumable. External effects have no stable identity across a process restart.
- Resume is not exactly-once for side effects. If an agent changed the world and the result was not committed before the pause, that call can run again. Effectful steps should be idempotent, or the program should inspect state before repeating them.
- A **budget-limited** run (it hit the cap) cannot be resumed with a bare resume. Resume has to raise `agent_budget` above the number of agents already admitted. A normal pause/resume of a run that still has budget left does not need this.

### Isolation is opt-in per agent

A child can share the project workspace (default) or run in a private worktree. Worktree isolation keeps parallel editors from colliding; it does **not** merge those edits back. If any isolated edit should reach the project, the program has an explicit select-and-apply step after the panel.

Capability on a child is coarse: read-only, read-write, execute, or all. Reviewers and verifiers should be read-only unless the workflow’s job is to change the tree.

### Workflows do not launch workflows

No nesting. Inline the child’s logic, or keep two definitions and let the user run them as separate runs. Child agents also do not spawn workflows, and they do not spawn their own unbounded agent trees on the side — the workflow is the only spawner for that run.

### Failure policy is a choice the program makes

Optional advice may fail open (a dead reviewer just means “no comment from that dimension”). A panel that is the **proof gate** must fail closed: missing, failed, or empty evidence means the claim stays unverified. Independent skeptics prompted to refute, with a demand for concrete evidence they themselves inspected, are the intended shape of verification — not a second agent rubber-stamping the first.

---

## What `/create-workflow` does

`/create-workflow` starts an **authoring conversation** with the current assistant. It does not open a blank editor and hope. The assistant’s job is to produce a saved, smoke-checked definition and then offer a real run.

The procedure is always this, in order:

1. **Gather intent, conversationally.** What should a run do? What work-list fans out in parallel (a fixed list, a directory, args)? What gets verified, and is that gate fail-closed? What is the final artifact (a report, a structured result)? Roughly how many agents is the user comfortable spending per run?

2. **Pick a name and a scope.** Same naming rule as other SwarmCode commands: lowercase letters, digits, hyphens. Project scope is the default inside a repo (shareable). User scope is for every project. The name is the invocation name.

3. **Author the workflow.** Shape is: metadata (name, description, optional phase list) → output contracts → one section per phase. Child prompts are imperative and self-contained. The program — not the prompts — enforces scope and evidence. The assistant talks to the user about “the workflow,” not about the file format.

4. **Smoke-check one path.** Before saving, the host checks that the definition is well-formed, that the whole program compiles, and that **the single path selected by representative args** can execute against canned host results (every spawned agent “succeeds” with a small fixed object). This is not a live run. It does not enumerate branches, does not call real tools, does not prove schema handling for every agent, and does not validate external side effects. Iterate on the definition until this path-specific check passes.

5. **Save.** The smoke-checked definition is written to the chosen scope. It is now runnable by name: `/review-changes` or `/workflow review-changes …`. Saving does not start a run. `/workflows` still shows nothing for it until something is launched.

6. **Offer a real run** with representative args. If the user agrees, launch in the background and point them at `/workflows`. If they decline, stop. Only the smoke check ran.

7. **Report** what was saved, what the smoke check did and did not cover, how to launch it, and the maximum agent fan-out a run will spend.

`/create-workflow` is allowed to be refused mid-way (the user abandons authoring). Nothing is saved until step 5. A saved definition can be edited later; an in-flight run of the old copy is unaffected.

Authoring patterns that are in-bounds for this procedure (the assistant should reach for them, not invent a new control style each time):

- Build the work-list the simplest deterministic way that is exactly right (args, a fixed list, a directory walk). Spend agents on judgment, not on deciding scope. If an agent *must* discover the work-list, treat its output as untrusted and re-filter it in the program against the invariant before sharding.
- Plan → parallel fan-out → synthesize.
- Adversarial verification: one skeptic per claim, fail closed.
- Loop until dry: keep a find-round until two consecutive rounds add nothing; fingerprint a round to detect stalls.
- Vote panels: N skeptics per item in one flat panel, regrouped by index.

Authoring anti-patterns the procedure is responsible for avoiding: terse child prompts, unguarded agent output, pause-on-a-result-branch (that re-fires forever — human gates are await-user), silent truncation when a cap drops items, and putting invariants only in prompt text.

---

## What `/workflow` does

`/workflow` is the **launch and control** command for a single run. Users identify runs by the display name shown in `/workflows`. They never pass internal IDs.

It does four jobs:

- **Launch a saved definition**, optionally with args. Args are the run’s input (`target`, `query`, a path, a JSON object). Missing required args should pause with a clear message, not crash. The launch returns immediately; a run appears in `/workflows`.
- **Pause** a running run by display name.
- **Resume** a run that is waiting on an ordinary pause or await-user gate. Resume continues the original frozen program, args, and cap from committed journal entries. It refuses to combine with a different definition or different args. It refuses a budget-limited run unless the resume also raises the agent cap. It cannot revive an Interrupted run from a process restart.
- **Stop** a run by display name. Stop is allowed even when resume is not (budget-limited, and so on).
- **Save** a run’s current script as a definition. Hidden / refused for known built-ins and for numbered duplicate handles until the user picks a new unique name.

Launching the same definition twice in one session produces `name` and `name-2`. Pause, resume, and stop take that handle, not the definition name, when more than one run exists.

`/workflow` is also how a **raised-budget resume** happens: the run is still the same run, but the cap is increased so the program can admit the next panel. A bare resume without a higher cap cannot do that.

---

## What `/workflows` does

`/workflows` opens the **run dashboard**. It is a live view of runs in this session — active and retained — not a library of saved definitions.

A row is a run. It shows at least:

- the display name (`review-changes-2`)
- the current phase
- the agent roster for that run (who was spawned, who is live, who finished)
- progress (including log lines the program emitted)
- the result once the run has completed — or the pause reason if it is waiting

From a run, the user can:

- **inspect** it (phases, agents, result, the script that is actually running)
- **pause** it
- **resume** it, when resume is legal (ordinary pause / await-user; not budget-limited without a raised cap; not Interrupted)
- **stop** it
- **save** the script that run is executing, subject to the same built-in / numbered-handle rule as `/workflow save`

What `/workflows` does **not** do:

- It does not list saved definitions that have never been launched. Those live in project/user/built-in scope and as named commands.
- It does not edit the definition in place and patch the running run. Edits become a new run.
- It does not replace the conversation. The conversation still receives the final result (and can receive progress). The dashboard is how you watch and control many runs at once, including after you have moved on in the chat.

Built-in product features that are themselves workflows (a research pipeline, a review pipeline) should show up here the same way as user-authored ones. Same display names, same pause/resume/stop, same “this is a run, not a definition.”

---

## How a run should feel

The user asks for a pipeline, or invokes a saved name, or agrees to the real run at the end of `/create-workflow`.

The app starts a run in the background and gives it a display name. The conversation is free. `/workflows` is where the run can be watched: phase marks, a panel of agents in flight, log lines, a pause that needs an answer, a completed result.

If the program needs a human decision, the run waits. Resuming continues from after the gate, with prior agent work reused from the journal. If the program is done, it completes, the result is the run’s output, and the conversation gets that output (a summary, confirmed findings, a report).

If the user wants a different pipeline, they change the definition and launch again. The old run, if still alive, is still the old program.

---

## Relation to the rest of SwarmCode

| Existing thing | Stays | Workflows add |
| --- | --- | --- |
| Chat turn | Default back-and-forth | Not used as the orchestrator of a pipeline |
| `/swarm` | Improvised Lead + children for a one-off task | Saved, host-run, repeatable pipeline with a budget and a journal |
| Custom `/commands` | Prompt templates for the current assistant | Named launches that start a run |
| `/goal` | Conversation-level objective | Bounded program with `complete` |
| Approval mode (read-only / auto / full access) | Still the user’s permission envelope | Child capability and worktree isolation *inside* that envelope |

The first workflow feature to build is this model — definitions, runs, `/create-workflow`, `/workflow`, `/workflows` — not a particular built-in pipeline. Built-ins (review, research, and so on) should be workflows in this sense once the model exists.
