# codex-loop prompt templates

Write each prompt to its own file in `$RUN` with your file tool or a quoted
heredoc (`<<'EOF'`), then append the plan with `cat "$RUN/plan.md" >> <file>`.
Never put a prompt in a double-quoted shell argument.

## Planner (fresh subagent, Phase 1)

```text
Draft an implementation plan for the task below, working in <ROOT>.
Read the code it touches first, including callers and tests. Do not edit files.
Return a numbered list of steps. Each step names:
- the files it touches;
- its done-condition;
- a proof: an exact command and its expected result (and a time limit if long).
Tag a step [orchestrator] if it needs network, credentials, installs, a real
database migration or live settings. Mark adjacent trivial steps [batch].
End with one final proof command for the whole task, then a list of open
questions and assumptions.
Task:
<task.md contents>
```

## Round 1 review (`prompt-r1.md`)

```text
Review this implementation plan for a <task type>. Read the relevant repository
files too, including code that calls or writes anything the plan changes, not
only the files the plan lists. Do not edit any file.
Start your reply with exactly one verdict word on its own line:
'APPROVE' if it is sound and ready to build;
'REVISE' followed by a numbered list of objections;
'BLOCKED' if you could not see something you need in order to judge it (name it).
Every objection must give: the plan step or file, a concrete way it breaks
(what input or state leads to what wrong result), severity (high/medium/low),
and a fix. Drop any objection you can't back with that evidence.
Judge: correctness, missing steps, risky ordering, untested assumptions, and
whether each step's proof command really proves its done-condition.
If you need facts you don't have, write 'RESEARCH:' and the specific question.
End with two lines: "Checked: <files you read>" and "Limits: <what you couldn't see>".
Plan follows:
```

## Argument turn K (`prompt-r<K>.md`)

```text
Taking objections <N, ...>, folded into the plan. Pushing back on <M, ...>:
<one line of reasoning each>.
Concede a pushed-back objection only if my reasoning is actually correct. If it
isn't, defend it with evidence. Do not concede just to reach agreement.
Don't reopen objections already settled unless you have new evidence.
<Research findings, if any, each marked with its source and confidence.>
Steps changed this turn: <step numbers>. The full current plan is below.
Re-check the WHOLE plan, not only the changed steps: did any change break,
contradict or duplicate another step?
Reply in the same format: APPROVE, REVISE + numbered evidence-backed
objections, or BLOCKED. End with "Checked:" and "Limits:" lines.
```

## Build step N (`prompt-step<N>.md`)

```text
Execute step <N> of the approved plan ONLY: <step text>.
Do not start step <N+1>. Edit only the files this step names.
Do not run git add, commit, stash, checkout or reset.
Report what you changed, including any new files.
```

## Correction (`prompt-step<N>-fix<J>.md`)

```text
Step <N> is not done yet: <what is wrong, with the failing proof output>.
Fix only that. Do not start another step. Same file and git rules as before.
Report what you changed.
```

## Final check (fresh checker, Phase 4)

```text
You did not write this code. Check the finished work against the plan.
Inputs: task.md, plan.md, the logged proof outputs, and the diff below for the
files this run touched. Read any new (untracked) files in full; the diff may not
show them. Do not edit any file.
Also check that the tests really test the plan's done-conditions, rather than
confirming whatever the code happens to do.
Reply: 'APPROVE', 'REVISE' + numbered objections (file, how it breaks,
severity, fix), or 'BLOCKED'. End with "Checked:" and "Limits:" lines.
```
