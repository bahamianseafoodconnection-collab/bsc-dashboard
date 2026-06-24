# BSC AI Team — Workflow

One command starts the whole team:

```bash
cd /Users/dedrickstorr/Documents/GitHub/bsc-dashboard && ./start-bsc-ai.sh
```

This opens a tmux session **`bsc-ai`** with four windows:

| Window | Name | Role | Runs |
|--------|------|------|------|
| 1 | `claude-architect` | Chief Architect | `claude` |
| 2 | `codex-builder` | Builder | `codex` |
| 3 | `aider-editor` | Editor / Refactor | `aider` |
| 4 | `git-control` | Source Control | `git status` |

tmux quick keys: `Ctrl-b 1..4` switch windows · `Ctrl-b d` detach (team keeps running) · re-run the script to re-attach · `tmux kill-session -t bsc-ai` to stop.
If a tool isn't installed, its window prints how to install it; the rest still start.

## The chain
```
Founder → Claude Code (Architect) → Codex (Builder) → Cursor (Research/Extract) → Aider (Editor) → Git → Founder AI
```

## How a feature flows
1. **Architect (Claude Code)** writes/updates the **CURRENT APPROVED TASK** in `AI_TEAM_TASK.md` — defines logic, data flow, schema needs, screens, security, traceability, compliance.
2. **Cursor** (when documents are involved) extracts the records/forms/fields/CCPs and proposes requirements back into the task file.
3. **Codex (Builder)** implements *only* the approved task.
4. **Aider (Editor)** refactors/cleans/improves UI + docs — without altering approved logic.
5. **Git** tracks everything. Not "done" until `git status` is clean, tests/`tsc`/build pass, and the change is committed with a descriptive message.
6. **Founder** reviews and approves.
7. **Founder AI** monitors the running ecosystem and reports daily.

## Safety checklist (run before every major task)
Read `AI_TEAM_RULES.md` → read `AI_TEAM_TASK.md` → `git status` + confirm branch → identify files to change → build only the requested feature → run tests/`tsc --noEmit`/build → review `git diff` → commit only after review.

## Non-negotiables (from the constitution)
Never break working features. Never change tax math (government tax separate from the 7% platform profit). One batch number from receiving → export, unchangeable, with all HACCP/SOP/SSOP/temp/weight/packing/storage/export/traceability records attached. RBC reports match trace#+amount to checkout orders; unmatched → manual review. Verify against the live DB, not migrations. Secrets in Vercel env only. See `AI_TEAM_RULES.md` for the full list.
