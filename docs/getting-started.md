# Getting started

Amethyst is an ADE (Agentic Development Environment) for Windows 10 and 11. You run your own coding agents in parallel on your own accounts, keep every project in one window, and switch between tasks without stopping running agents.

## 1. Install Amethyst

1. Download `Amethyst-Setup-<version>.exe` from the latest GitHub Release and run it.
2. The installer is not code-signed yet, so Windows SmartScreen may show a warning. Click **More info**, then **Run anyway**.
3. The installer also places `amethyst.cmd` in `%LOCALAPPDATA%\Amethyst\bin` on your `PATH` so you can use the `amethyst` command from any new terminal.

You can use the editor, terminals, boards, and project explorer without signing in to any agent.

## 2. Sign in to at least one coding agent

Amethyst runs each agent through its own CLI on your own account. Install and sign in to whichever agents you already use:

- **Claude:** install Claude Code and sign in (`claude auth login`), or enter an Anthropic API key, Console account, Bedrock, Vertex, or Foundry setup in Amethyst.
- **Codex:** install the Codex CLI and run `codex login`, or use an API key.
- **Antigravity:** install the Antigravity CLI (`agy`) and sign in with your Google account or Gemini API key.
- **Cursor:** install the Cursor CLI (`agent`) and sign in, or use an API key.
- **GitHub Copilot:** install the Copilot CLI (`copilot`) and sign in, or use a GitHub token.

See [Agent setup and accounts](agent-setup-and-accounts.md) for managing multiple Claude accounts, usage limits, and per-agent skills and instructions.

## 3. Set up your first workspace and project

- A **project** is any folder on disk (usually a git repository). Each project keeps its own chats, tabs, terminals, and state in its own folder in Amethyst's data (`%APPDATA%\Amethyst\projects\`); nothing is written into the project.
- A **workspace** is a collection of projects shown together in the project dock at the bottom of the window.

Add your project folder to a workspace, then click projects in the dock (or press `Alt+Shift+Left` / `Alt+Shift+Right`) to switch in one click. Chats and terminals run in Amethyst's local server, so agents in other projects keep working while you switch.

## 4. Start your first chats

- Press `Ctrl+R` (or click **+ agent** in the left rail) to open a new chat, or use `Ctrl+1` through `Ctrl+5` to start a specific agent directly (`1` Claude, `2` Codex, `3` Antigravity, `4` Cursor, `5` Copilot).
- In the chat box, choose your model, reasoning effort, and permission mode (or cycle them with `Alt+C`, `Alt+Z`, and `Alt+M`).
- Use `@` to reference files, folders, or other chats by their short code (like `Q20`), and paste or drop up to 6 images per message.
- If a chat is busy, you can still send follow-up messages — they wait in its queue, and you can take them back or send one immediately.

## 5. Run several tasks in parallel

- **Agent decks (`Alt+A`):** arrange live chats in sets. Chats waiting for your answer are listed first; press `Alt+N` to jump straight to the next chat that needs you.
- **The bench (`Alt+B`):** move chats that can wait out of view while they keep running, and bring them back when you are ready.
- **Worktrees:** toggle the worktree button in a new chat's box before sending its first message so it works on its own branch in an isolated folder. See [Worktrees and context handoff](worktrees-and-handoff.md).
- **Review and Rewind:** inspect every file a chat changed in the Edits strip or Review window, and rewind both the chat and files if an approach does not pan out. See [Reviewing edits and rewind](review-and-rewind.md).

## 6. Make the window yours

- **Hide anything you do not use:** right-click almost any button, panel, or bar to hide it for good (or browse all toggles in **Settings -> Show and hide**).
- **Command palette:** press `Ctrl+Shift+P` to find any command and its shortcut, or `Ctrl+P` to open any file.
- **Rebind keys and themes:** customize themes, accent colors, syntax colors, and shortcuts in **Settings**.
