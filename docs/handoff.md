# How handoff works, step by step

This page describes what Amethyst does when a chat moves to another agent and when you change a chat's model, directly from the implementation.

## The short version

- A chat can switch agents at any point (Claude, Codex, Antigravity, Cursor, GitHub Copilot, Grok). The new agent starts its own session and never sees the old agent's session or memory.
- Amethyst builds a text, the **handoff**, only from the chat's own log on your computer. No model writes it and nothing extra is sent anywhere to build it. It is sent along with the first message you send after the switch.
- If **Improved Handoff** is on, the old agent first summarizes a long chat with its own compact command, so the new agent gets that summary plus any turns after it.
- You can inspect the exact text the new agent received at any time: click the **with the chat so far, from `<agent>`** chip under your message to open the **What `<agent>` was given** card, switch between **Read** and **Exact text**, or copy it.

## When the handoff is built

1. You pick **continue with `<agent>`** in the chat's agent menu. Amethyst refuses while a turn is running, queued, or waiting on a question: wait for it to end, or stop it first.
2. If **Improved Handoff** is on (or you choose it in the prompt, see below), the old agent summarizes the chat first.
3. The old agent's session is put to sleep, not deleted. Amethyst remembers its session id for this chat.
4. The new agent starts. If it already had a session in this chat (you switched away from it before), that session is resumed. If the new agent fails to start, the chat stays on the old agent.
5. Nothing is sent yet. The handoff is built at the moment you send your next message, so it includes everything up to then. It goes ahead of your message (or after it if your message starts with a `/` slash command on agents that handle slash commands, so the command still runs). If sending fails because the new agent is signed out, the handoff is kept for when you sign in and send again.
6. A chat where you never wrote anything switches without a handoff.

## What goes into the handoff

The text has three parts: a header, the chat, and a footer.

### Header

In this order, each only when it applies:

- **An opening line** telling the agent that this is a handoff from Amethyst, to read it and not answer it, and that your message follows.
- **Who it takes over from**, that it has none of the old session, that you can see the whole chat so it should not repeat it back, and that files may have changed: it should check them and `git status` itself before relying on anything in the handoff.
- **The rules file to read first**, only when the old agent and new agent use different rules files, the old one exists, and the new one does not. For example, a project with `CLAUDE.md` (or `.claude/CLAUDE.md`) but no `AGENTS.md` tells Codex to read `CLAUDE.md`. If both agents share the same rules file (such as `AGENTS.md`) or the new agent's own rules file already exists, nothing is added because the agent loads it itself.
- **The working folder.** In a worktree it also names the branch and the main folder, and tells the agent to work in the worktree, not the main folder.
- **Original ask**: your first message in the chat (up to 300 characters). Only added when the chat had to be shortened.
- **Files this chat changed**: every file the chat edited, from the review panel and the edit log, up to 80 (then `… and N more`).
- **Unresolved failures**: tool calls that failed and were not later run again successfully, up to 10. Only added when the chat had to be shortened.
- **The last plan**: the agent's latest checklist, each item marked done `[x]`, in progress `[~]`, or open `[ ]`.
- **The old agent's own summary**, if it compacted the chat (by itself or through Improved Handoff), up to 6,000 characters.

### The chat

The conversation, oldest first, written as `User: ...` and `<Agent>: ...`, with each tool call as one short line under it:

- `edited <files>`, `deleted <files>`, `moved <files>` (with `(failed)` if an edit or delete failed)
- `` ran `<command>`: completed `` or `: failed` (command trimmed to 160 characters)
- other tools by their title and result

Short notes in parentheses mark turns you stopped, turns that failed (with the first part of the error), and points where the chat went on with another agent. Images you attached (`[images: ...]`) and the file you had open (`[open file: ...]`) are named next to your message by path.

What is left out of the chat part:

- **Reading and searching.** Completed reads, searches, greps, globs, file lists, and read-only shell commands (`ls`, `dir`, `cat`, `grep`, `rg`, `git status`, `git log`, `git diff`, `Get-Content` and similar, alone or chained) are dropped. They are noise for the new agent, which can read files itself. A read-only tool or command that failed is kept. A shell command that writes anything (`>`, `2>&1`, `rm`, `mv`, `cp`, `mkdir`, `tee`) is always kept.
- **Subagents' inner steps.** Only the main chat is included.
- **Anything before the summary**, if the old agent compacted: the summary in the header stands in for it.
- **Turns the new agent already saw.** When you switch back to an agent that was in this chat before, it resumes its own session, so the handoff only has what happened since it last took part ("The chat since `<agent>` last took part"). If nothing happened since then, it says so.

### Footer

- Where the full, uncut chat is saved on disk, and that the agent can read it for more. If parts were cut, it says so first.
- `[End of the handoff.]`

## When the chat is too long

The chat part has a budget of about 40,000 characters. Below it, nothing is cut. Above it, Amethyst shortens it in this order, stopping as soon as it fits:

1. Your **last two turns** (your message and everything after it) are protected until everything older has been shortened.
2. Older agent replies keep their first 160 and last 240 characters, with `[…]` in between, so the conclusion survives, not only the opening.
3. Older tool lines and notes are dropped.
4. Older messages of yours longer than 1,200 characters keep their first and last 500 characters.
5. Older turns are dropped, oldest first.
6. Only then are the protected last two turns shortened: long agent replies are clipped first, then long user messages, then tool lines and notes, and finally oldest remaining items until one remains.

When anything was dropped, a line says how many earlier steps were left out. When anything was cut, the header also gets the original ask and unresolved failures, so the goal and open problems stay visible.

## The full chat on disk

Every handoff also writes the whole chat, with nothing filtered or cut, to the project's folder in Amethyst's data (`%APPDATA%\Amethyst\projects\<project>-<code>\handoffs\`), never into the project itself:

- `<chat id>-<n>.md` for a switch (`n` counts the switches)
- `<chat id>-shrink-<n>.md` before an Improved Handoff summary

The files are deleted when you close the chat. The agent is given access to that folder, so it reads them without asking.

It lists the files changed and every step, including reads and searches. The new agent is pointed to it, so a detail cut from the handoff is still one file read away. It stays on your computer.

## Improved Handoff

A plain handoff is instant and free: it is built from the log. Improved Handoff adds one step for long chats: before the switch (or before a model change), the **current** agent summarizes the chat with its own compact command. That costs one turn on the old agent and takes as long as that turn.

- **What it asks.** Amethyst first saves the full chat to `<chat id>-shrink-<n>.md` in that folder, then sends `/compact` asking the agent to keep file paths, numbers, decisions, and errors word for word, and telling it where the full chat is saved. Codex uses its own compact call (`thread/compact/start`) instead of a `/compact` prompt.
- **After a switch,** the new agent gets that summary in the header, plus only the turns after it.
- **After a model change** on the same agent, there is no handoff: the agent keeps its session, now compacted, so the new model starts light. If you pick another model while the summary is still running, the latest model you picked is applied once it finishes.
- **When it is skipped,** with no summary and no cost:
  - the chat is short (it grew by less than 50,000 tokens since it started on this agent, or the agent has not reported token usage),
  - nothing was asked in the last hour (the old agent's cache has expired, so a summary would cost a full re-read),
  - the agent does not expose a compact command (such as Cursor), or the model did not actually change.
- **If the summary fails or you stop it,** the switch (or model change) still happens using the chat log as usual, and a notice tells you what happened.
- **Where to turn it on:** the **Improved Handoff** switch in the chat box, or the **Improved Handoff** toggle in the **continue with...** menu. Both control the same setting for this chat and set the default for new chats.
- **The prompt.** With Improved Handoff off, picking **continue with...** on a long chat asks whether to use it this once: **Instant handoff** or **Improved Handoff**. Tick **Don't ask again** to stop the question (you can re-enable it in Settings under **Ask about Improved Handoff when switching agents**).

## Reading and copying what was sent

- Click the **with the chat so far, from `<agent>`** chip under your first message after a switch to open the **What `<agent>` was given** card.
- The card has two views: **Read** (laid out by part: where it works, original ask, files changed, unresolved failures, the last plan, earlier summary, and the chat) and **Exact text** (the raw prompt text).
- The copy button on the card copies the exact text that was sent, word for word.
- **copy the chat as a handoff** in the agent menu copies the full chat as a handoff from the beginning, with no 40,000-character cut (still filtering read-only tool noise) and without writing a file to disk, ready to paste into any other tool.

## What Amethyst never does

- It does not ask a model to write the handoff (Improved Handoff uses the old agent's own compact command, on the old agent's session, only when it is on).
- It does not send your chat to any service other than the agents you chose.
- It does not delete the old agent's session: switching back resumes it.
- It does not change, commit, or merge files when switching.
