# Amethyst Guides

These guides explain how Amethyst works and what to tell your coding agents when you want them to use Amethyst's tools.

## Start here

- [Getting started](getting-started.md): install on Windows, set up workspaces and projects, sign in to your agents, and learn the core workflow.
- [Modes, browser tab, quick tools, and shortcuts](modes-and-shortcuts.md): Editor, Orchestration, Terminals, The Mind, the browser element picker, quick windows, Freeze Log, and default shortcuts.
- [Agent setup and accounts](agent-setup-and-accounts.md): where each agent stores instructions, skills, rules, and memory, plus multi-account Claude switching and usage limits.
- [Reviewing edits and rewind](review-and-rewind.md): review agent file edits per file or per turn, keep or reject changes, and rewind chats and files with restore points.

## Agent workflows and automation

- [Agents from other models as subagents](agents.md): start Claude, Codex, Antigravity, Cursor, or GitHub Copilot as a subagent from inside any chat.
- [Driving other chats (orchestration)](orchestration.md): have one chat or your terminal start, message, wait for, read, and organize other chats in the same project.
- [CLI and MCP server](cli-and-mcp.md): use the `amethyst` command from your terminal or scripts, and connect outside agents through `amethyst mcp`.
- [Command and MCP reference](commands.md): complete auto-generated reference of every `amethyst` CLI command, flag, and MCP tool.
- [Worktrees and context handoff](worktrees-and-handoff.md): isolate parallel chats in git worktrees, copy gitignored files with `.worktreeinclude`, and switch a chat from one agent to another mid-conversation.
- [How handoff works, step by step](handoff.md): exactly what the next agent is given when a chat switches agents, what is left out or cut, where the full chat is saved, and what Improved Handoff does.

## Project tools

- [Git, pull requests, and issues](git-and-github.md): open diffs, history, branch comparisons, PRs, and issues in Amethyst's UI from an agent, and customize branch naming patterns.
- [Unreal Engine and the debugger](unreal-debugger.md): set up the native Windows debugger and let agents inspect or control a live Unreal Editor or game session.

## Help and security

- [Support](SUPPORT.md): where to ask questions and what to include in a bug report.
- [Security](SECURITY.md): how to report a security problem privately.
