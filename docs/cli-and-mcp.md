# CLI and MCP server

Amethyst exposes the same set of actions in two ways:

1. The **`amethyst` CLI** for your own terminals, scripts, and chats running inside Amethyst.
2. An **MCP server** (`amethyst mcp`) for agents running outside Amethyst (such as Claude Code in a standalone terminal, Codex CLI, or other MCP clients).

Both talk to the running Amethyst app over its local server, so they always stay in sync.

## Using the `amethyst` CLI

When you install Amethyst on Windows, it places `amethyst.cmd` in `%LOCALAPPDATA%\Amethyst\bin` and adds that folder to your user `PATH`. It uses Amethyst's own runtime, so you do not need a separate Node.js installation.

Open a new terminal and run:

```powershell
amethyst help
amethyst help chat
amethyst help agent
amethyst help git
amethyst help pr
amethyst help issue
amethyst help debug
```

For the full list of every command, flag, and MCP tool name, see the auto-generated [Command and MCP reference](commands.md).

### Global flags

Every `amethyst <feature> <action>` command accepts these flags:

- `--json` — print the full structured JSON response instead of human-readable text.
- `--project <name>` — target a named Amethyst project instead of detecting the project from your current folder.
- `--am <n>` — target Amethyst window number `n`.

### Exit codes

- `0` — succeeded.
- `1` — failed (Amethyst returned an error, or Amethyst is not running).
- `2` — invalid command or arguments.

### How Amethyst finds the running app

Amethyst writes its local port to `%APPDATA%\Amethyst\.amethyst\server.json`. If you are running a separate dev instance, set `AMETHYST_URL=http://127.0.0.1:<port>` in your environment to point the CLI at it.

## How chats inside Amethyst use it

By default, Amethyst adds no extra instructions to your chats so your context window stays clean.

- **Claude, Codex, Cursor, and GitHub Copilot chats** inside Amethyst get `amethyst` on their shell `PATH` along with their chat identity (`AMETHYST_URL`, `AMETHYST_CHAT`, `AMETHYST_PASS`). When you ask them to use an `amethyst` command, they run it in their shell.
- **Antigravity chats** inside Amethyst also receive the `amethyst` MCP server automatically.

Claude, Codex, Cursor and Copilot chats have no Amethyst MCP tools, so tell them to use the command: for example "work through the `amethyst` command; `amethyst help ue` lists the Unreal ones". In an Unreal project a chat can then make the project (`amethyst ue project`), add plugins, modules and classes (`amethyst ue new`), generate project files, build and read the errors (`amethyst ue generate`, `amethyst ue build`), open Unreal Editor (`amethyst ue editor`) and read its log (`amethyst ue log`). See the [command reference](commands.md#unreal-projects-amethyst-ue).

Subagents started with `amethyst agent run` do not receive the CLI identity or MCP server, so they cannot spawn nested subagents.

## Connecting outside agents with MCP

If you want an agent running outside Amethyst to drive your Amethyst chats, open diffs in the UI, or use the Unreal debugger, run:

```powershell
amethyst mcp add
```

It prints ready-to-paste setup snippets for your platform:

### Claude Code

```powershell
claude mcp add amethyst -- cmd /c amethyst mcp
```

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.amethyst]
command = "cmd"
args = ["/c", "amethyst", "mcp"]
```

### Other MCP clients (JSON)

```json
{
  "mcpServers": {
    "amethyst": {
      "command": "cmd",
      "args": ["/c", "amethyst", "mcp"]
    }
  }
}
```

The outside agent acts on the Amethyst project that owns the folder it runs in.

### What an outside agent or a terminal can't do

Amethyst counts only its own window as you. Any other caller (an agent over MCP, the `amethyst` command in any terminal, a script that calls the local address) reaches just the commands listed here. Unless you turn on **chats answer other chats' permission asks**, it can't answer a permission ask, approve a plan so that the chat works without asking, or pick a mode that doesn't ask. It can never change Amethyst's settings or open a terminal in it. Answer permission asks in the app.

### CLI-only commands vs. MCP tools

Most `chat`, `agent`, `debug`, and UI-opening `git`/`pr`/`issue` actions are available in both the CLI and MCP (where `amethyst chat read` becomes the tool `chat_read`). Routine git and GitHub write commands like `git commit`, `git push`, `git branch`, and `pr create` are CLI-only, because coding agents already run `git` and `gh` directly.

## Settings

Open **Settings -> Agents -> Amethyst tools** to turn **the amethyst command in terminals** on or off (this adds or removes `amethyst.cmd` from your `PATH`).
