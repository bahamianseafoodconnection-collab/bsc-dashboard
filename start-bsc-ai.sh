#!/usr/bin/env bash
# ============================================================
# BSC AI Terminal Team launcher
# One command opens a tmux session with the whole AI team:
#   Window 1  claude-architect  (Chief Architect)
#   Window 2  codex-builder     (Builder)
#   Window 3  aider-editor      (Editor / Refactoring)
#   Window 4  git-control       (Source Control)
#
# Run:  cd /Users/dedrickstorr/Documents/GitHub/bsc-dashboard && ./start-bsc-ai.sh
# ============================================================
set -euo pipefail

SESSION="bsc-ai"
PROJ="/Users/dedrickstorr/Documents/GitHub/bsc-dashboard"

if ! command -v tmux >/dev/null 2>&1; then
  echo "❌ tmux is not installed. Install it first:  brew install tmux"
  exit 1
fi

# Already running? Just attach.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "↻ bsc-ai session already running — attaching."
  exec tmux attach -t "$SESSION"
fi

# Launch a tool if installed, else show a friendly note in that pane.
launch() {
  local win="$1"; local cmd="$2"; local tool="${3:-$2}"
  tmux send-keys -t "$SESSION:$win" "clear; echo '── $win ──'; cat AI_TEAM_RULES.md | head -8" C-m
  tmux send-keys -t "$SESSION:$win" "if command -v $tool >/dev/null 2>&1; then $cmd; else echo; echo '⚠  $tool is not installed in this terminal.'; echo '   Install it, then run: $cmd'; fi" C-m
}

echo "🚀 Starting BSC AI team (read AI_TEAM_RULES.md + AI_TEAM_TASK.md first)…"

tmux new-session  -d -s "$SESSION" -n claude-architect -c "$PROJ"
launch claude-architect "claude" "claude"

tmux new-window -t "$SESSION" -n codex-builder -c "$PROJ"
launch codex-builder "codex" "codex"

tmux new-window -t "$SESSION" -n aider-editor -c "$PROJ"
launch aider-editor "aider" "aider"

tmux new-window -t "$SESSION" -n git-control -c "$PROJ"
tmux send-keys -t "$SESSION:git-control" "clear; git status; git branch --show-current" C-m

tmux select-window -t "$SESSION:claude-architect"
exec tmux attach -t "$SESSION"
