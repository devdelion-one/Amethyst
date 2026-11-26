# Command and MCP reference

This reference is generated directly from Amethyst's action tables so every command, flag, and MCP tool name stays in sync with the app.

Run `amethyst help` or `amethyst help <feature>` in your terminal for the same help text from the running app. For setup and workflows, see [CLI and MCP server](cli-and-mcp.md).

## Global flags and exit codes

Every `amethyst <feature> <action>` command accepts:

- `--json` — print the full JSON response.
- `--project <name>` — target a named Amethyst project instead of detecting from the current folder.
- `--am <n>` — target Amethyst window number `n`.

Exit codes: `0` done, `1` failed (error from Amethyst or app not running), `2` invalid usage.

## Features

- [Agent subagents (`amethyst agent`)](#agent-subagents-amethyst-agent)
- [Chat orchestration (`amethyst chat`)](#chat-orchestration-amethyst-chat)
- [Git (`amethyst git`)](#git-amethyst-git)
- [Pull requests (`amethyst pr`)](#pull-requests-amethyst-pr)
- [Issues (`amethyst issue`)](#issues-amethyst-issue)
- [Unreal projects (`amethyst ue`)](#unreal-projects-amethyst-ue)
- [Unreal debugger (`amethyst debug`)](#unreal-debugger-amethyst-debug)

## Agent subagents (`amethyst agent`)

### `amethyst agent run`

**Surface:** CLI and MCP tool `agent_run`

Start a subagent of any kind (claude, codex, antigravity, cursor, copilot or grok) on a task and get its answer. It runs as its own agent in this project's folder; the user sees it as a subagent of this chat, with its steps. Returns its answer under a first line naming it by its code (like "Codex - H57:"), the code amethyst agent send takes; with background, its code at once. A mode that may work without asking is the user's to pick: a chat can't start one in it unless the user allowed chats to answer permission asks. To a chat in a mode that may work without asking, your prompt waits for the user to allow it, unless the user allowed chats to answer permission asks; that chat shows a permission ask with it.

```powershell
amethyst agent run <agent> <prompt...> [--model <model>] [--effort <effort>] [--mode <mode>] [--worktree] [--background] [--timeout <timeout>]
```

- `agent` (string, required): claude, codex, antigravity, cursor, copilot or grok
- `prompt` (string, required): The task, as you would give it to a person who knows nothing of this chat
- `--model` (string, optional): A model it offers, e.g. opus, sonnet or gpt-5
- `--effort` (string, optional): An effort it offers, e.g. low, medium or high
- `--mode` (string, optional): A mode it offers that asks, e.g. default or plan
- `--worktree` (boolean, optional): Work in its own git worktree
- `--background` (boolean, optional): Return at once; you are told when it finishes, and amethyst agent wait gives its answer
- `--timeout` (number, optional): Seconds to wait at most; without it, it waits until it is done

### `amethyst agent send`

**Surface:** CLI and MCP tool `agent_send`

Send one of your subagents a follow-up; it keeps what it did before. Returns its answer, or with background at once.

```powershell
amethyst agent send <agent> <text...> [--background] [--timeout <timeout>]
```

- `agent` (string, required): The subagent: the code amethyst agent run gave it (like S71)
- `text` (string, required): The follow-up
- `--background` (boolean, optional): Return at once; amethyst agent wait gives its answer
- `--timeout` (number, optional): Seconds to wait at most; without it, it waits until it is done

### `amethyst agent wait`

**Surface:** CLI and MCP tool `agent_wait`

Wait until one of these subagents finishes, and get its answer. With a timeout, when it runs out it says which still work.

```powershell
amethyst agent wait <agents...> [--timeout <timeout>]
```

- `agents` (list, required): Their codes
- `--timeout` (number, optional): Seconds to wait at most; without it, it waits until it is done

### `amethyst agent stop`

**Surface:** CLI and MCP tool `agent_stop`

Stop what one of your subagents is doing. It keeps what it did; amethyst agent send gives it more.

```powershell
amethyst agent stop <agent>
```

- `agent` (string, required): The subagent: the code amethyst agent run gave it (like S71)
## Chat orchestration (`amethyst chat`)

### `amethyst chat list`

**Surface:** CLI and MCP tool `chat_list`

The chats in this project: each one's code (Q20), title, agent, model, mode and status (starting, working, asks, done, idle, ended), and since when.

```powershell
amethyst chat list
```

### `amethyst chat new`

**Surface:** CLI and MCP tool `chat_new`

Start a new chat in this project. It is a normal chat the user sees and can type into; it goes next to yours when your set has a free cell, else in the set given, else in the agents list. With text it gets that as its first message (or, with draft, finds it in its message box for the user to send). Returns its code. Give it more work with amethyst chat send. A mode that may work without asking is the user's to pick: a chat, an agent outside Amethyst or a terminal can't start one in it unless the user allowed chats to answer permission asks. To a chat in a mode that may work without asking, its first message waits for the user to allow it, unless the user allowed chats to answer permission asks; that chat shows a permission ask with it.

```powershell
amethyst chat new [text...] [--agent <agent>] [--model <model>] [--mode <mode>] [--worktree] [--set <set>] [--report] [--attach <a,b>] [--draft] [--follow] [--amethyst <amethyst>]
```

- `--agent` (string, optional): claude (the default), codex, antigravity, cursor, copilot or grok
- `--model` (string, optional): A model it offers, e.g. opus or sonnet (amethyst chat options lists them)
- `--mode` (string, optional): A mode it offers that asks, e.g. default or plan
- `--worktree` (boolean, optional): Work in its own git worktree (made with its first message)
- `--set` (string, optional): Where to show it: a chat set (its id, or + for a new one), or an editor set (ed:<id>, or ed:new for a new one)
- `--report` (boolean, optional): Notify me: the user gets a notification each time it is ready (amethyst chat report turns it off)
- `text` (string, optional): Its first message, sent at once
- `--attach` (list, optional): Files to send with the first message (files in this project): pictures go as pictures, other files as @path
- `--draft` (boolean, optional): Put the text in its message box unsent, for the user to send
- `--follow` (boolean, optional): Take the user to it (not from a chat: a chat never moves the user)
- `--amethyst` (number, optional): The Amethyst (window) it opens in, 1 by default; it shows there when that Amethyst opens

Example: `amethyst chat new --set + --follow "plan the landing page"`

### `amethyst chat send`

**Surface:** CLI and MCP tool `chat_send`

Send a message to another chat, as if the user typed it (it shows as from you). If the chat is busy, the message waits in its queue. Returns the message's qid. When it finishes, you get a short message saying so (unless tell is false), or call amethyst chat wait; then amethyst chat read gives the answer. To a chat in a mode that may work without asking, the message waits for the user to allow it, unless the user allowed chats to answer permission asks; that chat shows a permission ask with it.

```powershell
amethyst chat send <chat> <text...> [--attach <a,b>] [--now] [--worktree] [--tell] [--report]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `text` (string, required): The message
- `--attach` (list, optional): Files to attach (files in this project): pictures go as pictures, other files as @path
- `--now` (boolean, optional): If the chat is busy, put the message into its current turn instead of the queue (agents that can take it)
- `--worktree` (boolean, optional): On a fresh chat: work in its own git worktree
- `--tell` (boolean, optional): false: no message to you when it finishes (default true)
- `--report` (boolean, optional): Also turn on notify me for the chat: the user gets a notification each time it is ready

Example: `amethyst chat send Q20 "write a haiku"`

### `amethyst chat draft`

**Surface:** CLI and MCP tool `chat_draft`

Put text in a chat's message box without sending it: the user reads it, changes it if they like, and sends it. Text already in the box stays; this goes after it.

```powershell
amethyst chat draft <chat> <text...>
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `text` (string, required): The text

Example: `amethyst chat draft Q20 "also check the footer"`

### `amethyst chat stop`

**Surface:** CLI and MCP tool `chat_stop`

Stop the chat's current turn and take back its queued messages. The chat stays open.

```powershell
amethyst chat stop <chat>
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.

### `amethyst chat seen`

**Surface:** CLI and MCP tool `chat_seen`

Mark a finished chat as read: its green mark and finished badge go, and the counts drop. A chat that isn't finished and unread is left as it is.

```powershell
amethyst chat seen <chat>
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.

### `amethyst chat wait`

**Surface:** CLI and MCP tool `chat_wait`

Wait until one of these chats finishes the message you sent it, asks something, or ends; it returns that one. A chat you sent nothing to returns when it stops working. With a timeout, when it runs out it says which are still working.

```powershell
amethyst chat wait <chats...> [--qid <qid>] [--timeout <timeout>]
```

- `chats` (list, required): The chats to wait for: codes, titles or ids
- `--qid` (string, optional): Wait for this message's answer only
- `--timeout` (number, optional): Seconds to wait at most; without it, it waits until it is done

Example: `amethyst chat wait Q20 V10`

### `amethyst chat read`

**Surface:** CLI and MCP tool `chat_read`

A chat's answer: the reply to your message (qid), or to its last message. With full, the tools it ran too, one line each. Long answers come in parts: from says where to go on.

```powershell
amethyst chat read <chat> [--qid <qid>] [--full] [--from <from>]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `--qid` (string, optional): The message whose answer to read (default: the last one)
- `--full` (boolean, optional): Also the tools it ran, one line each
- `--from` (number, optional): Go on from this character

### `amethyst chat asks`

**Surface:** CLI and MCP tool `chat_asks`

What the chat asks now: questions, forms, plan approvals and permission asks, each with its options.

```powershell
amethyst chat asks <chat>
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.

### `amethyst chat answer`

**Surface:** CLI and MCP tool `chat_answer`

Answer what the chat asks: an option (its name, id or number), or, for a form with several questions, answers by field. Permission asks (run a command, edit a file), and a plan's choices that let the chat work without asking, are the user's to answer in Amethyst's window. That holds for chats, agents outside Amethyst and terminals, unless the user allowed chats to answer permission asks.

```powershell
amethyst chat answer <chat> [option...] [--answers <json>] [--ask <ask>]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `option` (string, optional): The option or the answer text; cancel to dismiss it
- `--answers` (object, optional): For a form: { field: value } (amethyst chat asks lists the fields)
- `--ask` (string, optional): Which ask, when it has several (amethyst chat asks lists them)

### `amethyst chat options`

**Surface:** CLI and MCP tool `chat_options`

The chat's options and what each is set to: model, effort, mode, Ultracode and whatever its agent offers, with the values each takes.

```powershell
amethyst chat options <chat>
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.

### `amethyst chat set`

**Surface:** CLI and MCP tool `chat_set`

Set one of the chat's options, as the user would in its box: model, effort, mode, Ultracode (on or off), ... (amethyst chat options lists them). Model, effort and the modes that ask are open to all; a mode that may work without asking is the user's to pick, also from agents outside Amethyst and terminals, unless the user allowed chats to answer permission asks.

```powershell
amethyst chat set <chat> <option> <value>
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `option` (string, required): The option: its id or name
- `value` (string, required): The value: its id or name

Example: `amethyst chat set Q20 model sonnet`

### `amethyst chat show`

**Surface:** CLI and MCP tool `chat_show`

Show the chat to the user: in the set given, or next to the calling chat when its set has a free cell, or in the chat set that's on.

```powershell
amethyst chat show <chat> [--set <set>]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `--set` (string, optional): A chat set (its id, or + for a new one), or an editor set (ed:<id>, or ed:new)

### `amethyst chat review`

**Surface:** CLI and MCP tool `chat_review`

Open the chat's Review window for the user: every file it changed, with the changes marked and Keep / Reject on each. With a file, the window opens at that file.

```powershell
amethyst chat review <chat> [--file <file>]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `--file` (string, optional): A file the chat changed: its path in the project

Example: `amethyst chat review Q20 --file src/app.ts`

### `amethyst chat report`

**Surface:** CLI and MCP tool `chat_report`

Notify me: while it's on, the user gets a notification each time the chat is ready (its turn ended, or it asks something) and they aren't looking at it. The notification shows the start of the answer and takes them to the chat. With no on or off it flips.

```powershell
amethyst chat report <chat> [--on] [--off]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `--on` (boolean, optional): true: turn it on; false: turn it off
- `--off` (boolean, optional): Turn it off

Example: `amethyst chat report Q20 --off`

### `amethyst chat note`

**Surface:** CLI and MCP tool `chat_note`

The chat's note: a short text the user (or you) leaves on a chat, such as what it waits for. It shows in the user's chat lists. With text it replaces the note; with clear it removes it; with neither it returns the note.

```powershell
amethyst chat note <chat> [text...] [--clear]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `text` (string, optional): The new note
- `--clear` (boolean, optional): Remove the note

Example: `amethyst chat note Q20 waiting for 850 to finish`

### `amethyst chat rename`

**Surface:** CLI and MCP tool `chat_rename`

Rename a chat: the name the user sees for it in their chat lists and its header. With a title it renames it; with clear it gets its automatic name back (the agent's own title, or the start of its first message); with neither it returns the name.

```powershell
amethyst chat rename <chat> [title...] [--clear]
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
- `title` (string, optional): The new name
- `--clear` (boolean, optional): Give it its automatic name back

Example: `amethyst chat rename Q20 plan for the importer`

### `amethyst chat move`

**Surface:** CLI and MCP tool `chat_move`

Move chats to another Amethyst (a window of the app, numbered from 1), into a set there. They keep running; that Amethyst shows them, this one doesn't.

```powershell
amethyst chat move <chats...> [--amethyst <amethyst>] [--set <set>]
```

- `chats` (list, required): The chats to move: codes, titles or ids
- `--amethyst` (number, required): The number of the Amethyst to move them to
- `--set` (string, optional): Where there: a chat set (its id, or + for one new set for all of them), or an editor set (ed:<id>, or ed:new). Default: the set that's on there

Example: `amethyst chat move Q20 V10 --amethyst 1`

### `amethyst chat end`

**Surface:** CLI and MCP tool `chat_end`

End a chat and close it. Only the user ends a chat someone else started: a chat, or an agent outside Amethyst, ends only the chats it started.

```powershell
amethyst chat end <chat>
```

- `chat` (string, required): The chat: its code (Q20 or @Q20), its title, or its id. Only chats in your own project.
## Git (`amethyst git`)

### `amethyst git status`

**Surface:** CLI and MCP tool `git_status`

What source control shows for this project: the branch and its remote branch, commits to push and to pull, a merge or rebase under way, and each changed file with its letter (M changed, A new, D deleted, R renamed, C conflict) and whether it is staged.

```powershell
amethyst git status [--repo <repo>]
```

- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git repos`

**Surface:** CLI only

The repositories in this project: its own, its submodules, and folders one level down that are repositories.

```powershell
amethyst git repos
```

### `amethyst git commit`

**Surface:** CLI only

Commit the changed files, as the commit button does: what is staged in git if anything is, otherwise every change (secrets left out). Prints what was committed. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git commit [message...] [--push] [--amend] [--force] [--skip <a,b>] [--repo <repo>]
```

- `message` (string, optional): The commit message
- `--push` (boolean, optional): Push after the commit
- `--amend` (boolean, optional): Change the last commit instead of making a new one: what is staged goes into it (nothing staged: only the message changes)
- `--force` (boolean, optional): With amend: also when the last commit is on the remote already
- `--skip` (list, optional): Files to leave out
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

Example: `amethyst git commit "Fix the login form" --push`

### `amethyst git fetch`

**Surface:** CLI only

Ask the remote for new commits now. Prints how many there are to pull and to push. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git fetch [--repo <repo>]
```

- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git pull`

**Surface:** CLI only

Pull the remote’s commits into this branch. When both sides have new commits it follows git’s pull.rebase setting, or --how. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window. While that setting is off, it refuses a change that brings in an agent's settings or hooks (like .claude/settings.local.json or .github/hooks/): that change is the user's to make.

```powershell
amethyst git pull [--how <how>] [--repo <repo>]
```

- `--how` (string, optional): rebase or merge, when both sides have new commits
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

Example: `amethyst git pull --how rebase`

### `amethyst git push`

**Surface:** CLI only

Push this branch; the first time, publish it. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git push [--lease] [--repo <repo>]
```

- `--lease` (boolean, optional): Push over the remote’s old version of commits changed here (force with lease)
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git sync`

**Surface:** CLI only

Pull, then push. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window. While that setting is off, it refuses a change that brings in an agent's settings or hooks (like .claude/settings.local.json or .github/hooks/): that change is the user's to make.

```powershell
amethyst git sync [--how <how>] [--repo <repo>]
```

- `--how` (string, optional): rebase or merge, when both sides have new commits
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git branch`

**Surface:** CLI only

Switch to a branch, or make one with --create. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window. While that setting is off, it refuses a change that brings in an agent's settings or hooks (like .claude/settings.local.json or .github/hooks/): that change is the user's to make.

```powershell
amethyst git branch <name> [--create] [--from <from>] [--changes <changes>] [--repo <repo>]
```

- `name` (string, required): The branch
- `--create` (boolean, optional): Make it and switch to it; the changes come along
- `--from` (string, optional): With create: the branch, tag or commit it starts at
- `--changes` (string, optional): stash: leave the changed files on the branch you leave; they come back when you switch back
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

Example: `amethyst git branch fix-login --create --from origin/main`

### `amethyst git branch-names`

**Surface:** CLI and MCP tool `git_branch_names`

The patterns this project names new branches by, with an example of each: chat (a chat's own worktree, default chat/{chat}), issue (starting on an issue, default {n}-{title}), pr (a pull request in its own folder, default pr/{n}) and new (what the new branch box starts with, default empty). Placeholders: {chat} the chat's code, {n} the issue or pull request number, {title} the issue title, {user} your git user name. Give a pattern to change it, an empty one for its default; they apply to branches made from then on.

```powershell
amethyst git branch-names [--chat <chat>] [--issue <issue>] [--pr <pr>] [--new <new>] [--reset]
```

- `--chat` (string, optional): A chat's worktree branch, e.g. ai/{chat}
- `--issue` (string, optional): A branch for an issue; needs {n}, e.g. feature/{n}-{title}
- `--pr` (string, optional): A pull request opened in its own folder; needs {n}, e.g. review/{n}
- `--new` (string, optional): What the new branch box starts with, e.g. {user}/
- `--reset` (boolean, optional): All four back to their defaults

Example: `amethyst git branch-names --issue "feature/{n}-{title}" --chat "ai/{chat}"`

### `amethyst git abort`

**Surface:** CLI only

Undo the merge or rebase that is under way. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git abort [--repo <repo>]
```

- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git skip`

**Surface:** CLI only

Leave out the commit that clashes and go on with the rebase, cherry-pick or revert under way. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git skip [--repo <repo>]
```

- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git init`

**Surface:** CLI only

Start a git repository in this project, write a default .gitignore when none is there, and make the first commit (secrets left out). Refuses if the folder is already in git or holds another repository.

```powershell
amethyst git init [--branch <branch>]
```

- `--branch` (string, optional): The first branch name (main by default)

Example: `amethyst git init --branch main`

### `amethyst git clone`

**Surface:** CLI only

Copy a repository onto this PC, with its submodules, and add it as a project to the workspace it is run from (a chat or terminal in one of its projects). Run outside a workspace, it only copies. Prints where it went. While the user has "chats answer other chats' permission asks" off, it refuses a repository that has an agent's settings or hooks (like .claude/settings.local.json or .github/hooks/): that clone is the user's to make.

```powershell
amethyst git clone <url> [into] [--name <name>] [--add]
```

- `url` (string, required): Its address, or owner/repo for GitHub
- `into` (string, optional): The folder (new or empty); by default the repository’s name, here
- `--name` (string, optional): The project’s name in Amethyst
- `--add` (boolean, optional): Add it as a project (default true)

Example: `amethyst git clone owner/repo`

### `amethyst git tag`

**Surface:** CLI only

Tag the commit you are on (or --at another), and with --push send the tag to the remote. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git tag <name> [--at <at>] [--message <message>] [--push] [--repo <repo>]
```

- `name` (string, required): The tag, usually a version: v1.2.0
- `--at` (string, optional): A branch, tag or commit to tag instead
- `--message` (string, optional): Makes an annotated tag with this message
- `--push` (boolean, optional): Push the tag
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

Example: `amethyst git tag v1.2.0 --push`

### `amethyst git log`

**Surface:** CLI only

The commits of this branch, newest first: hash, date, author and subject, marked when not pushed. Fifty at a time.

```powershell
amethyst git log [path] [--q <q>] [--ref <ref>] [--skip <skip>] [--repo <repo>]
```

- `path` (string, optional): Only the commits that changed this file, past its renames
- `--q` (string, optional): Search: words in the message, author:name, or code:text for when a text came in or went
- `--ref` (string, optional): Another branch, tag or commit
- `--skip` (number, optional): Skip this many, for the next page
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

Example: `amethyst git log --q author:ana`

### `amethyst git blame`

**Surface:** CLI only

Who changed each line of a file: line number, commit, author and the line.

```powershell
amethyst git blame <path> [--repo <repo>]
```

- `path` (string, required): The file
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git diff`

**Surface:** CLI and MCP tool `git_show_diff`

Open a file's changes in Amethyst's diff tab for the user: the last commit against the disk, or --a and --b (commits, branches or tags; b defaults to the disk).

```powershell
amethyst git diff <path> [--a <a>] [--b <b>] [--repo <repo>]
```

- `path` (string, required): The file
- `--a` (string, optional): The older side
- `--b` (string, optional): The newer side
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

Example: `amethyst git diff src/app.ts --a main`

### `amethyst git history`

**Surface:** CLI and MCP tool `git_show_history`

Open the history in Amethyst's source control panel for the user: the branch's, another ref's, or one file's.

```powershell
amethyst git history [path] [--ref <ref>] [--repo <repo>]
```

- `path` (string, optional): Only this file
- `--ref` (string, optional): Another branch, tag or commit
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git compare`

**Surface:** CLI and MCP tool `git_show_branch`

Open a branch in Amethyst for the user: its commits and files against the base (the remote's main branch unless --base), each opening as a diff.

```powershell
amethyst git compare <ref> [--base <base>] [--repo <repo>]
```

- `ref` (string, required): The branch
- `--base` (string, optional): What to compare it with
- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

Example: `amethyst git compare chat/q20`

### `amethyst git continue`

**Surface:** CLI only

Go on with the merge or rebase that is under way, once its conflicts are fixed. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git continue [--repo <repo>]
```

- `--repo` (string, optional): A repository inside the project, by its folder (amethyst git repos lists them); the project’s own when left out

### `amethyst git release`

**Surface:** CLI only

Publish a GitHub release for a tag (pushed first if needed), with notes GitHub writes from the pull requests since the last one, or your own. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst git release <tag> [--title <title>] [--notes <notes>] [--repo <repo>]
```

- `tag` (string, required): The tag, e.g. v1.2.0
- `--title` (string, optional): Its title; the tag by default
- `--notes` (string, optional): Your own notes instead
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst git release v1.2.0`
## Pull requests (`amethyst pr`)

### `amethyst pr list`

**Surface:** CLI and MCP tool `pr_list`

The open pull requests of this project's GitHub repository: number, title, author, branch → base, draft, review state and checks.

```powershell
amethyst pr list [--show <show>] [--repo <repo>]
```

- `--show` (string, optional): open (the default), mine, or review (waiting for my review)
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst pr list --show review`

### `amethyst pr view`

**Surface:** CLI and MCP tool `pr_view`

One pull request: its state, branch → base, files and lines, review state, each check, what blocks the merge, and its description.

```powershell
amethyst pr view <n> [--repo <repo>]
```

- `n` (number, required): The pull request’s number
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

### `amethyst pr open`

**Surface:** CLI and MCP tool `pr_open`

Open a pull request in its tab in Amethyst, for the user.

```powershell
amethyst pr open <n> [--repo <repo>]
```

- `n` (number, required): The pull request’s number
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

### `amethyst pr create`

**Surface:** CLI only

Open a pull request for the branch you are on (pushed first if needed); an issue number in the branch name is linked with "Fixes #N". While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst pr create <title...> [--body <body>] [--base <base>] [--draft] [--repo <repo>]
```

- `title` (string, required): Its title
- `--body` (string, optional): Its description, markdown
- `--base` (string, optional): The branch it goes into; the repository’s main one by default
- `--draft` (boolean, optional): Open it as a draft
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst pr create "Fix the login" --draft`

### `amethyst pr comment`

**Surface:** CLI only

Comment on a pull request.

```powershell
amethyst pr comment <n> <body...> [--repo <repo>]
```

- `n` (number, required): The pull request’s number
- `body` (string, required): The comment
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

### `amethyst pr review`

**Surface:** CLI only

Review a pull request: approve, ask for changes, or comment.

```powershell
amethyst pr review <n> [--how <how>] [--body <body>] [--repo <repo>]
```

- `n` (number, required): The pull request’s number
- `--how` (string, required): approve, changes or comment
- `--body` (string, optional): What the review says (needed to ask for changes)
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst pr review 12 --how approve`

### `amethyst pr merge`

**Surface:** CLI only

Merge a pull request on GitHub, in a way the repository allows. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window.

```powershell
amethyst pr merge <n> [--how <how>] [--delete-branch] [--auto] [--repo <repo>]
```

- `n` (number, required): The pull request’s number
- `--how` (string, required): squash, merge or rebase
- `--delete-branch` (boolean, optional): Delete its branch after
- `--auto` (boolean, optional): Merge by itself once what blocks it is done
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst pr merge 12 --how squash`

### `amethyst pr checkout`

**Surface:** CLI only

Switch the project's folder to a pull request's branch, or with --worktree open it in a folder of its own. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window. While that setting is off, it refuses a change that brings in an agent's settings or hooks (like .claude/settings.local.json or .github/hooks/): that change is the user's to make.

```powershell
amethyst pr checkout <n> [--worktree] [--repo <repo>]
```

- `n` (number, required): The pull request’s number
- `--worktree` (boolean, optional): In its own folder
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out
## Issues (`amethyst issue`)

### `amethyst issue list`

**Surface:** CLI and MCP tool `issue_list`

The issues of this project's GitHub repository: number, title, labels, author, comments.

```powershell
amethyst issue list [--show <show>] [--q <q>] [--repo <repo>]
```

- `--show` (string, optional): open (the default), mine (assigned to me) or closed
- `--q` (string, optional): Search words
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst issue list --show mine`

### `amethyst issue view`

**Surface:** CLI and MCP tool `issue_view`

One issue: its state, labels, assignees, the pull requests that close it, its text and its comments.

```powershell
amethyst issue view <n> [--repo <repo>]
```

- `n` (number, required): The issue’s number
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

### `amethyst issue open`

**Surface:** CLI and MCP tool `issue_open`

Open an issue in its tab in Amethyst, for the user.

```powershell
amethyst issue open <n> [--repo <repo>]
```

- `n` (number, required): The issue’s number
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

### `amethyst issue new`

**Surface:** CLI only

Open a new issue.

```powershell
amethyst issue new <title...> [--body <body>] [--labels <a,b>] [--me] [--repo <repo>]
```

- `title` (string, required): Its title
- `--body` (string, optional): Its text, markdown
- `--labels` (list, optional): Labels
- `--me` (boolean, optional): Assign it to me
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst issue new "Crash on start" --labels bug --me`

### `amethyst issue comment`

**Surface:** CLI only

Comment on an issue.

```powershell
amethyst issue comment <n> <body...> [--repo <repo>]
```

- `n` (number, required): The issue’s number
- `body` (string, required): The comment
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

### `amethyst issue close`

**Surface:** CLI only

Close an issue, as done or as not planned.

```powershell
amethyst issue close <n> [--reason <reason>] [--repo <repo>]
```

- `n` (number, required): The issue’s number
- `--reason` (string, optional): completed (the default) or "not planned"
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

### `amethyst issue start`

**Surface:** CLI only

Start on an issue: a branch named for it, linked to it on GitHub, and this folder switched to it; with --where folder, in a folder of its own instead. While the user has "chats answer other chats' permission asks" off, and the repo has a git hook that would run, it first waits for their OK in Amethyst's window. While that setting is off, it refuses a change that brings in an agent's settings or hooks (like .claude/settings.local.json or .github/hooks/): that change is the user's to make.

```powershell
amethyst issue start <n> [--where <where>] [--repo <repo>]
```

- `n` (number, required): The issue’s number
- `--where` (string, optional): here (the default) or folder
- `--repo` (string, optional): A repository inside the project, by its folder; the project’s own when left out

Example: `amethyst issue start 12`
## Unreal projects (`amethyst ue`)

### `amethyst ue project`

**Surface:** CLI and MCP tool `ue_project`

Make a new, empty Unreal C++ project in this folder: <Name>.uproject, Source/<Name>.Target.cs, Source/<Name>Editor.Target.cs (BuildSettingsVersion and IncludeOrderVersion Latest), one Runtime module Source/<Name> with IMPLEMENT_PRIMARY_GAME_MODULE, Config/DefaultEngine.ini, Config/DefaultGame.ini, .gitignore (when none is there) and Content/. It refuses if the folder already has a .uproject, and never overwrites a file. It lists the files it made.

```powershell
amethyst ue project <name> [--engine <engine>]
```

- `name` (string, required): The project name, a C++ name
- `--engine` (string, optional): The engine: a version such as 5.7, or its folder; the newest one installed by default

Example: `amethyst ue project ProjectIsometric --engine 5.7`

### `amethyst ue new`

**Surface:** CLI and MCP tool `ue_new`

Add a plugin, a module or a class to this Unreal project from the engine's own templates, as Unreal Editor would. A plugin goes in Plugins/<Name> and is enabled in the .uproject; a module goes in Source/<Name> (or in a plugin's Source with --plugin) and is added to the .uproject or .uplugin and to every target; a class goes in Source/<Project> or --dir. Nothing is overwritten. It lists the files it made and changed; generate project files and build next.

```powershell
amethyst ue new <kind> <name> [--template <template>] [--plugin <plugin>] [--type <type>] [--phase <phase>] [--targets <a,b>] [--parent <parent>] [--dir <dir>] [--public] [--description <description>] [--friendly-name <friendly-name>] [--category <category>] [--deps <a,b>] [--private-deps <a,b>] [--class <class>]
```

- `kind` (string, required): class, module or plugin
- `name` (string, required): Its name, a C++ name; a class without its U/A prefix
- `--template` (string, optional): A plugin: the engine template, Blank (the default), ContentOnly, BlueprintLibrary, Basic, Advanced, EditorMode or ThirdPartyLibrary
- `--plugin` (string, optional): A module: the plugin it goes in
- `--type` (string, optional): A module: its Type, Runtime by default (Editor, Developer, ...)
- `--phase` (string, optional): A module: its LoadingPhase, Default by default
- `--targets` (list, optional): A project module: the targets it is added to, all by default
- `--parent` (string, optional): A class: its parent class, such as AActor or UActorComponent; UObject by default, UInterface for an interface, "" for a plain C++ class
- `--dir` (string, optional): A class: the folder it goes in, relative to the project; Source/<Project> by default
- `--public` (boolean, optional): A class in a module with Public and Private folders: put the header in Public
- `--description` (string, optional): A plugin: its .uplugin's Description
- `--friendly-name` (string, optional): A plugin: its .uplugin's FriendlyName (defaults to the plugin name)
- `--category` (string, optional): A plugin: its .uplugin's Category (Other by default)
- `--deps` (list, optional): A module: extra public dependency module names, comma separated
- `--private-deps` (list, optional): A module: extra private dependency module names, comma separated
- `--class` (string, optional): A module: IModuleInterface class name (e.g. FMyEditorModule) instead of FDefaultModuleImpl

Example: `amethyst ue new module MyToolsEditor --plugin MyTools --type Editor`

### `amethyst ue deps`

**Surface:** CLI and MCP tool `ue_deps`

Add public or private module dependencies to an existing module's .Build.cs (in Source/ or in a plugin's Source/). Skips dependencies already listed.

```powershell
amethyst ue deps <module> [--add <a,b>] [--private-add <a,b>] [--plugin <plugin>]
```

- `module` (string, required): The module name, e.g. MyGame or MyToolsEditor
- `--add` (list, optional): Public dependency module names to add, comma separated
- `--private-add` (list, optional): Private dependency module names to add, comma separated
- `--plugin` (string, optional): The plugin containing the module (optional, found automatically if omitted)

Example: `amethyst ue deps MyToolsEditor --add Slate,SlateCore --private-add AssetTools`

### `amethyst ue generate`

**Surface:** CLI and MCP tool `ue_generate`

Generate the project files (the .sln) for this Unreal project with its engine, and wait for the end. It says whether it succeeded, with any errors. While the user has "chats answer other chats' permission asks" off, each run first waits for their OK in Amethyst's window.

```powershell
amethyst ue generate [--timeout <timeout>]
```

- `--timeout` (number, optional): Seconds to wait at most, 300 by default, 0 for no limit; then ue wait waits on

Example: `amethyst ue generate`

### `amethyst ue build`

**Surface:** CLI and MCP tool `ue_build`

Build this Unreal project with UnrealBuildTool and wait for the end: the Editor target in Development by default. It says whether it succeeded and lists the errors and warnings as file:line:col. The build runs on in Amethyst's build window if the wait runs out; ue wait waits on. It refuses while Unreal Editor is open on the project (its files are locked), unless --force. While the user has "chats answer other chats' permission asks" off, each run first waits for their OK in Amethyst's window.

```powershell
amethyst ue build [target] [--config <config>] [--rebuild] [--clean] [--force] [--timeout <timeout>]
```

- `target` (string, optional): The target, such as MyGameEditor or MyGame; the Editor target by default
- `--config` (string, optional): Development (the default), DebugGame or Shipping
- `--rebuild` (boolean, optional): Rebuild everything
- `--clean` (boolean, optional): Clean instead of building
- `--force` (boolean, optional): Build even while Unreal Editor is open on the project
- `--timeout` (number, optional): Seconds to wait at most, 300 by default, 0 for no limit

Example: `amethyst ue build --config DebugGame`

### `amethyst ue wait`

**Surface:** CLI and MCP tool `ue_wait`

Wait for this project's build (or project file generation) to end, and say how it went, with its errors and warnings.

```powershell
amethyst ue wait [--timeout <timeout>]
```

- `--timeout` (number, optional): Seconds to wait at most, 300 by default, 0 for no limit

Example: `amethyst ue wait --timeout 600`

### `amethyst ue cancel`

**Surface:** CLI and MCP tool `ue_cancel`

Stop this project's running build.

```powershell
amethyst ue cancel
```

Example: `amethyst ue cancel`

### `amethyst ue editor`

**Surface:** CLI and MCP tool `ue_editor`

Open Unreal Editor on this project and return at once; ue log shows how far it got. It refuses when the Editor target was never built (Unreal would stop at a dialog), unless --force. With --close, request a graceful close of the project's running Unreal Editor and wait for it to exit. While the user has "chats answer other chats' permission asks" off, each run first waits for their OK in Amethyst's window.

```powershell
amethyst ue editor [--force] [--close] [--timeout <timeout>]
```

- `--force` (boolean, optional): Open it even though the Editor target isn't built
- `--close` (boolean, optional): Close the project's running Unreal Editor gracefully and wait for it to exit
- `--timeout` (number, optional): With --close, seconds to wait for the editor to exit (15 by default)

Example: `amethyst ue editor`

### `amethyst ue log`

**Surface:** CLI and MCP tool `ue_log`

Read the end of this project's Unreal Editor log (Saved/Logs/<Project>.log), one line each: time, category, verbosity when not Log, text. Or the UnrealBuildTool log with ubt.

```powershell
amethyst ue log [which] [--lines <lines>] [--category <category>] [--verbosity <verbosity>] [--since <since>]
```

- `which` (string, optional): editor (the default) or ubt
- `--lines` (number, optional): How many lines from the end, 100 by default
- `--category` (string, optional): Only these categories, comma separated, such as LogModuleManager,LogPluginManager
- `--verbosity` (string, optional): Only this verbosity and worse: Warning, Error, ...
- `--since` (number, optional): Only the last this many seconds

Example: `amethyst ue log --category LogModuleManager --lines 40`
## Unreal debugger (`amethyst debug`)

### `amethyst debug start`

**Surface:** CLI and MCP tool `debug_start`

Start debugging this project's Unreal program: Unreal Editor (DebugGame Editor), built first, then started under the debugger; when the editor is already open it attaches to it instead. With game: the game in its own window (Unreal Editor with -game). With attach: only attach to the open editor. It returns at once; set breakpoints with amethyst debug break, then amethyst debug wait returns at the first stop. While the user has "chats answer other chats' permission asks" off, each run first waits for their OK in Amethyst's window.

```powershell
amethyst debug start [--game] [--attach] [--build]
```

- `--game` (boolean, optional): Debug the game: Unreal Editor with -game, in a window
- `--attach` (boolean, optional): Attach to the Unreal Editor that is open on this project
- `--build` (boolean, optional): Build the Editor target first (default true)

Example: `amethyst debug start --game`

### `amethyst debug status`

**Surface:** CLI and MCP tool `debug_status`

The debugger in this project: not debugging, building, running, or stopped, and then why (a breakpoint, a step, a crash, check() or ensure() failed, a value changed), where (file:line, function and the line's code), and whether an agent did it. Also how many breakpoints are set.

```powershell
amethyst debug status
```

### `amethyst debug stop`

**Surface:** CLI and MCP tool `debug_stop`

Stop debugging. By default it detaches: Unreal Editor (or the game) keeps running, with its unsaved work. With end: true it ends the program instead, and unsaved work in Unreal Editor is lost: only do that when the user asked for it.

```powershell
amethyst debug stop [--end]
```

- `--end` (boolean, optional): End the program instead of detaching: unsaved work in Unreal Editor is lost

Example: `amethyst debug stop`

### `amethyst debug continue`

**Surface:** CLI and MCP tool `debug_continue`

Let the stopped program run on. It returns at once; amethyst debug wait returns at the next stop.

```powershell
amethyst debug continue
```

### `amethyst debug pause`

**Surface:** CLI and MCP tool `debug_pause`

Stop the running program where it is (on Unreal's GameThread when the pause lands elsewhere). Returns where it stopped.

```powershell
amethyst debug pause
```

### `amethyst debug step`

**Surface:** CLI and MCP tool `debug_step`

Step the stopped program one line: over (the default) runs calls on this line without stopping in them, into goes into the call, out runs to the end of this function. Returns where it stopped next.

```powershell
amethyst debug step [how]
```

- `how` (string, optional): over (the default), into or out

Example: `amethyst debug step into`

### `amethyst debug break`

**Surface:** CLI and MCP tool `debug_breakpoints`

Breakpoints in this project. With at: set one at file:line (a path in the project, or just the file's name when it's the only one), with if: only when that C++ condition is true. With remove: take the one at file:line away. With neither: list them, each with whether it's bound (or waiting for its module to load), its hits and who set it. The program stops there next time the line runs.

```powershell
amethyst debug break [at] [--if <if>] [--remove <remove>] [--list]
```

- `at` (string, optional): Set a breakpoint at file:line, e.g. Source/Game/Pix.cpp:10 or Pix.cpp:10
- `--if` (string, optional): A C++ condition: stop only when it is true, e.g. Health < 0
- `--remove` (string, optional): Remove the breakpoint at file:line
- `--list` (boolean, optional): Only list them (the default with no at or remove)

Example: `amethyst debug break Pix.cpp:10 --if "Health < 0"`

### `amethyst debug stack`

**Surface:** CLI and MCP tool `debug_stack`

The call stack where the program stopped, one frame a line: #N function  file:line. Engine frames are marked (engine) and long runs of them fold into one line unless all is true; Blueprint frames show as [Blueprint] BP_Name - Function (the object). Use the numbers with amethyst debug vars and amethyst debug eval.

```powershell
amethyst debug stack [--all] [--thread <thread>]
```

- `--all` (boolean, optional): Every engine frame, not folded
- `--thread` (number, optional): Another thread by its id (default: the one that stopped)

### `amethyst debug vars`

**Surface:** CLI and MCP tool `debug_variables`

The variables of a frame while stopped (the locals, with this), as an indented tree: name = value - type, Unreal types read as in Visual Studio (FString as its text, TArray as Num=N with its items, UObject as Name (Class)). {...} means it opens further with a larger depth.

```powershell
amethyst debug vars [--frame <frame>] [--depth <depth>]
```

- `--frame` (number, optional): The frame: its number in amethyst debug stack (#0 is where it stopped, the default)
- `--depth` (number, optional): How many levels to open, 1 to 4 (default 2)

Example: `amethyst debug vars --frame 1 --depth 3`

### `amethyst debug eval`

**Surface:** CLI and MCP tool `debug_evaluate`

Evaluate a C++ expression in a frame while stopped, e.g. Health, this->Weapon or Items.Num. Returns its value and type, and its members when it has some. An expression with a call or an assignment could change the program: that needs the user's \"agents can control the debugger\". While the user has "chats answer other chats' permission asks" off, an expression with a call or an assignment first waits for their OK in Amethyst's window.

```powershell
amethyst debug eval <expr...> [--frame <frame>] [--depth <depth>]
```

- `expr` (string, required): The expression
- `--frame` (number, optional): The frame: its number in amethyst debug stack (#0 is where it stopped, the default)
- `--depth` (number, optional): How many levels of its members to show, 0 to 3 (default 0: one level)

Example: `amethyst debug eval this->Health`

### `amethyst debug wait`

**Surface:** CLI and MCP tool `debug_wait`

Wait until the program stops (a breakpoint, a step, a crash) or debugging ends, then say where and why, as amethyst debug status does. Returns at once if it is stopped already. After ms (default 30000, at most 900000) it says it is still running: call it again to keep waiting.

```powershell
amethyst debug wait [--ms <ms>]
```

- `--ms` (number, optional): How long to wait, in milliseconds (default 30000)

Example: `amethyst debug wait --ms 60000`

### `amethyst debug goto`

**Surface:** CLI and MCP tool `debug_goto`

Set the next statement: while stopped, move the program to another line of the same function (file:line). Code skipped or run again is not undone. The adapter refuses a line outside the function, and says why.

```powershell
amethyst debug goto <at>
```

- `at` (string, required): The line to run next: file:line, in the function where it stopped

Example: `amethyst debug goto Pix.cpp:12`

### `amethyst debug runto`

**Surface:** CLI and MCP tool `debug_run_to`

Run until the program reaches file:line (a breakpoint there for this once only, never saved), or stops anywhere else first. It returns at once; amethyst debug wait returns when it gets there.

```powershell
amethyst debug runto <at>
```

- `at` (string, required): Where to run to: file:line

Example: `amethyst debug runto Pix.cpp:20`
