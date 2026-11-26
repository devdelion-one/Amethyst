# Driving other chats (orchestration)

Any chat in Amethyst can orchestrate other full chats in the same project: start new chats, send them tasks, wait for them to finish, read their answers, change their models, and organize them into sets or windows. You can run the exact same commands from your own terminal.

## Subagents vs. chats

Amethyst gives you two ways to delegate work:

- **Subagents (`amethyst agent ...`):** live under the calling chat in Agent Activity, are meant for focused tasks, and stop when the parent chat stops. See [docs/agents.md](agents.md).
- **Chats (`amethyst chat ...`):** full, visible chats in your project. You can open them, type into them, move them between sets or windows, bench them, and keep them after the orchestrator finishes.

## How to ask your agent

Chats are not given instructions about Amethyst's commands by default, so tell your agent when you want it to orchestrate other chats:

> Start two chats in separate worktrees with `amethyst chat new --worktree` — one to build the API and one to write the tests — wait for both, then summarize what they did.

> Read what `@Q20` just answered using `amethyst chat read Q20` and draft a follow-up in its box with `amethyst chat draft`.

Each chat has a short code like `Q20`. You can also mention another chat in your own message box by typing `@` followed by its code.

## Commands

Run `amethyst help chat` for the live reference.

### Listing and starting chats

- `amethyst chat list` — list every chat in this project with its code, status (`starting`, `working`, `asks`, `done`, `idle`, `ended`), agent, model, mode, title, and note.
- `amethyst chat new [text]` — start a new chat in this project and return its code.
  - `--agent <name>` — `claude` (default), `codex`, `antigravity`, `cursor`, or `copilot`.
  - `--model <name>` — pick a model (see `amethyst chat options`).
  - `--mode <name>` — pick a mode (e.g. `default`, `plan`, `auto`).
  - `--worktree` — give the chat its own git worktree (created on its first message).
  - `--set <id>` — place it in a chat set (`+` for a new chat set), or an editor set (`ed:<id>` or `ed:new`).
  - `--attach <a,b>` — attach files (images go as images, other files as `@path`).
  - `--draft` — put the text in the chat's message box unsent so you can review and send it.
  - `--report` — turn on "notify me" so you get a notification each time it is ready.
  - `--follow` — jump the UI to the new chat (works from your terminal; a chat never moves your view).
  - `--amethyst <n>` — open it in Amethyst window `n` (1 by default).

### Sending messages and waiting

- `amethyst chat send <chat> <text>` — send a message to another chat. If it is busy, the message queues unless you pass `--now`. Returns a `qid` for that message.
  - `--attach <a,b>` — attach files or images.
  - `--now` — steer into the current turn instead of queuing (for agents that support steering).
  - `--worktree` — on a fresh chat, start it in its own git worktree.
  - `--no-tell` — do not notify the calling chat automatically when the target finishes.
  - `--report` — also turn on notifications for the user.
- `amethyst chat draft <chat> <text>` — append text to a chat's message box without sending it.
- `amethyst chat wait <chats...>` — wait until one of the listed chats finishes, asks a question, or ends. Accepts `--qid <qid>` and `--timeout <seconds>`.
- `amethyst chat read <chat>` — read the reply to a specific `--qid` or the chat's last message. Pass `--full` to include one-line tool call summaries, and `--from <offset>` to continue long answers.
- `amethyst chat stop <chat>` — stop the chat's current turn and clear its queued messages. The chat stays open.
- `amethyst chat end <chat>` — close a chat. A chat can only end chats that it started itself.

### Questions and permission asks

- `amethyst chat asks <chat>` — list what a chat is currently asking (questions, forms, plan approvals, or permission requests) along with its options.
- `amethyst chat answer <chat> [option]` — answer a chat's question by option name, id, or number, or pass `cancel` to dismiss it.
  - `--answers <json>` — answer a multi-field form as JSON, e.g. `{"scope":"server"}`.
  - `--ask <id>` — pick which ask to answer when a chat has more than one.

Permission requests (running a command, editing a file) always stay with you, in Amethyst's own window, unless you explicitly allow chats to answer them in settings. This holds for other chats, for agents outside Amethyst and for terminals, your own included. The same goes for a plan's choices that let the chat work without asking. Questions, forms, and plan choices that keep it asking can be answered by any of them.

### Models and options

- `amethyst chat options <chat>` — list a chat's available options (`model`, `effort`, `mode`, and any agent-specific options) along with their current and valid values.
- `amethyst chat set <chat> <option> <value>` — change one of the chat's options (for example, `amethyst chat set Q20 model sonnet`). Model and effort are open to every caller. With the setting below off, a mode that may work without asking (accept edits, auto, skip permissions and the like) is yours to pick in Amethyst's window, for a new chat (`chat new --mode`) and a subagent (`agent run --mode`) too.

### Organizing chats and opening Review

- `amethyst chat show <chat>` — bring a chat into view in `--set <id>` (or next to the calling chat).
- `amethyst chat review <chat>` — open the chat's Review window for you to inspect and keep or reject its file edits. Pass `--file <path>` to jump straight to one file.
- `amethyst chat report <chat>` — toggle "notify me" notifications (`--on` or `--off`).
- `amethyst chat note <chat> [text]` — read, replace, or `--clear` the short note shown on the chat in your lists.
- `amethyst chat rename <chat> [title]` — read, set, or `--clear` a chat's custom title.
- `amethyst chat seen <chat>` — mark a finished chat as read so its unread badge clears.
- `amethyst chat move <chats...> --amethyst <n>` — move one or more chats to another Amethyst window while they keep running. Optional `--set <id>`.

## Scope and safety

- **Same project only:** a chat can only list, read, or drive chats in its own project.
- **No self-calls:** a chat cannot send messages to itself, wait for itself, or end itself.
- **Turn limit:** a chat can send at most 50 messages per turn before it must finish its turn or ask you. Callers outside a chat (an agent outside Amethyst, a script, a terminal) share a limit of 50 messages a minute.
- **Ending chats:** only you end a chat someone else started; a chat or an agent outside Amethyst ends only the chats it started.

## Settings

Open **Settings -> Agents -> Amethyst tools** to control orchestration:

- **chats can drive other chats** — turns chat orchestration, subagents started with `amethyst agent run` and `@` chat mentions on or off. Off holds for other chats, agents outside Amethyst and terminals, your own included: only you, in Amethyst's own window, start and drive chats. An agent's own built-in subagents still work.
- **chats answer other chats' permission asks** — off by default; when off, permission prompts always wait for you, whoever tries to answer them: another chat, an agent outside Amethyst, a script or a terminal. They can't turn this setting on or pick a mode that doesn't ask either, and a message they send to a chat you put in such a mode shows in that chat as a permission ask: Allow sends it, Don't allow drops it. While it's off, Amethyst also asks you before it runs a project's code for them: an Unreal build, project files, Unreal Editor or debugging, a git action in a repo with hooks that would run, and an evaluate with a call or an assignment in the debugged program. And they can't clone, pull, switch or check out anything that brings in a repo's files that let chats skip asking (an agent's settings or hooks): you do that from Amethyst's window.
