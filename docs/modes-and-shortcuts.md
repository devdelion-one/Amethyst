# Modes, browser tab, quick tools, and shortcuts

Amethyst is built around switching cleanly between views of your work without losing state or stopping running agents.

## Workspace modes

Switch between modes from the left rail or with shortcuts:

- **Editor (`Alt+E`):** CodeMirror 6 editor with splits (`Ctrl+\`), tab groups, diff tabs, Markdown preview, image/PDF viewing, and chats beside your code. Press `Alt+E` again to cycle saved editor layouts (`Alt+Shift+E` creates a new layout).
- **Agents (`Alt+A`):** a live grid of chats organized into sets, with a spotlight column and a bench (`Alt+B`) for chats that keep running out of view. Press `Alt+A` again to cycle sets (`Alt+Shift+A` creates a new set).
- **Terminals (`Alt+T`):** real PowerShell and Command Prompt terminals (`xterm.js` + `node-pty`) arranged in sets, plus one-click launchers for agent CLIs (`claude`, `codex`, `agy`, `cursor`, `copilot`, `gemini`). Terminals keep running when you switch projects or close the window to the tray.
- **Research (`Alt+R`):** follow one chat alongside its live subagents and files in up to 4 tab groups side by side.
- **Orchestration (`Alt+Q`):** manage all active chats in the project in one calm overview, including benched chats and chats waiting for your input.
- **The Mind:** a visual canvas of your project's folders and files where recently touched files stand out.

## Built-in browser tab

Amethyst includes an embedded browser tab for checking local dev servers or docs right beside your agents:

- **Element picker:** click the pick tool and click any element on the page to send its URL, CSS selector, visible text, and HTML snippet directly into a chat.
- **Draw and send:** annotate directly on a web page and send the marked-up screenshot straight to a chat.
- **Hard refresh:** press `Ctrl+Shift+R` to reload the browser tab.

## Quick tools (from anywhere)

Each quick tool opens in its own small window and works from any mode:

- **Quick Agent (`Ctrl+Shift+Space`):** pop open a fast chat for the current project.
- **Quick Terminal (`` Ctrl+` ``) / Quick PowerShell (`Ctrl+~`):** toggle a quick shell in the current project.
- **Scratch Pad (`Alt+S`):** jot notes or prompts down immediately, then turn a note into a real file when ready.
- **Sketch Board (`Alt+D`):** open a freehand drawing board tab or window.
- **Inbox (`Alt+I`):** open your inbox folder to review captured files.
- **Don't Forget (`Ctrl+J`):** create reminders with timers, repeats, and snooze.
- **Clips:** save and reuse snippets.
- **Freeze Log:** automatically records slow frames, clicks, and stalls. Save a 40-second snapshot (with CPU profiles and system load) to attach to a bug report or hand directly to an agent to diagnose performance issues.

## Default keyboard shortcuts

Every shortcut can be rebound in **Settings**. Press `Ctrl+Shift+P` anytime to search all commands.

### Navigation and modes

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+P` | Quick open file |
| `Alt+E` / `Alt+Shift+E` | Editor mode (cycle layouts) / new editor layout |
| `Alt+A` / `Alt+Shift+A` | Agents mode (cycle sets) / new agents set |
| `Alt+T` | Terminals mode |
| `Alt+R` | Research mode |
| `Alt+Q` | Orchestration mode |
| `Alt+X` | Close or clear current set/layout |
| `Alt+Shift+Left` / `Alt+Shift+Right` | Previous / next project |

### Chats and decks

| Shortcut | Action |
|---|---|
| `Alt+N` | Jump to the next chat that needs you |
| `Alt+J` / `Alt+K` | Next / previous cell in a deck |
| `Ctrl+Q` | Add an empty cell to the current set |
| `Alt+B` | Bench the selected chat or terminal |
| `Alt+H` | Show / hide the agents or terminals list rail |
| `Ctrl+R` | New chat picker at pointer |
| `Ctrl+1` .. `Ctrl+5` | New chat: `1` Claude, `2` Codex, `3` Antigravity, `4` Cursor, `5` Copilot |
| `Alt+M` / `Alt+Shift+M` | Cycle permission mode in a chat's box |
| `Alt+C` / `Alt+Z` | Next / previous model in a chat's box |
| `Ctrl+N` | Show / hide a chat's note |
| `Ctrl+F` | Find in chat box or whole chat (press again to toggle) |
| `Ctrl+T` | Clear chat (asks first) |

### Tabs and editor

| Shortcut | Action |
|---|---|
| `Ctrl+\` | Split editor right |
| `Alt+W` | Close tab |
| `Alt+Shift+T` | Reopen closed tab |
| `Alt+1` .. `Alt+9` | Switch to tab 1..9 in the active group |
| `Alt+O` | Switch between C/C++ header and source (`Foo.h` and `Foo.cpp`) |
