# Unreal Engine and the debugger

Amethyst includes beta Unreal Engine C++ support on Windows: building with the engine named in your `.uproject`, live C++ diagnostics, and a native Windows debugger (Microsoft DbgEng) that both you and your agents can drive.

## Setup

1. Turn on Unreal Engine support in **Settings -> Unreal**.
2. Download the debugger in **Settings -> Unreal -> debugger** (about 17 MB, requires accepting Microsoft's license), or press `F5` the first time you debug. Only you can download or remove the debugger; agents cannot install it for you.

## Letting an agent debug with you

As with all Amethyst commands, chats are not told about `amethyst debug` automatically. Ask your agent in plain words when you want it to inspect or drive a debug session, for example:

> Set a breakpoint at `Source/MyGame/Player.cpp:142` when `Health < 0` using `amethyst debug break`, wait for it to hit with `amethyst debug wait`, then inspect the stack and local variables.

> Attach to my running Unreal Editor with `amethyst debug start --attach` and check why `InitInventory` crashes.

Every breakpoint and action an agent takes is marked as an agent action in the debug column so you can see what it did.

## Commands

Run `amethyst help debug` for the full reference.

### Starting, waiting, and stopping

- `amethyst debug start` — build the Editor target and launch Unreal Editor (`DebugGame Editor`) under the debugger, or attach if Unreal Editor is already open on the project.
  - `--game` — debug the game in its own window (Unreal Editor with `-game`).
  - `--attach` — attach to an already-open Unreal Editor without launching a new one.
  - `--no-build` — skip building before starting.
- `amethyst debug status` — report whether the debugger is idle, building, running, or stopped (and where/why), plus the breakpoint count.
- `amethyst debug wait [--ms <ms>]` — wait until the program stops (breakpoint, step, crash, failed `check()`/`ensure()`) or debugging ends. Defaults to `30000` ms (up to `900000` ms); call again if it is still running.
- `amethyst debug stop [--end]` — detach by default so Unreal Editor keeps running with your unsaved work. Passing `--end` terminates the process and discards unsaved work in Unreal Editor.

### Breakpoints and execution control

- `amethyst debug break [file:line]` — list all breakpoints when called with no arguments, or set one at `file:line` (a project-relative path, or just the filename if it is unique).
  - `--if "<expr>"` — conditional C++ breakpoint, e.g. `amethyst debug break Player.cpp:42 --if "Health < 0"`.
  - `--remove <file:line>` — remove a breakpoint.
- `amethyst debug continue` — resume execution.
- `amethyst debug pause` — pause the running program (preferring Unreal's GameThread).
- `amethyst debug step [over|into|out]` — step one line (`over` by default).
- `amethyst debug runto <file:line>` — run until `file:line` using a one-time breakpoint that is not saved.
- `amethyst debug goto <file:line>` — set the next statement to another line in the same function (skipped or repeated code is not undone).

### Inspecting state while stopped

- `amethyst debug stack [--all] [--thread <id>]` — show the call stack with frame numbers (`#0`, `#1`, ...). Long engine frame runs are folded unless you pass `--all`, and Blueprint frames appear as `[Blueprint] BP_Name`.
- `amethyst debug vars [--frame <n>] [--depth <1-4>]` — show local variables and `this` as an indented tree, with Unreal type formatting (`FString` text, `TArray` count and items, `UObject` name and class). Defaults to frame `0` and depth `2`.
- `amethyst debug eval <expr> [--frame <n>] [--depth <0-3>]` — evaluate a C++ expression (for example, `this->Weapon` or `Items.Num`).

## Read-only mode for agents

In **Settings -> Agents -> Amethyst tools**, you can toggle **agents can control the debugger**:

- **On (default):** agents can start and stop debugging, set/remove breakpoints, step, continue, pause, set the next statement, and evaluate expressions with calls or assignments.
- **Off:** agents can still read `debug status`, `debug stack`, `debug vars`, `debug wait`, list breakpoints (`debug break` with no arguments), and evaluate read-only expressions (no calls or assignments), but cannot change execution or state.

The setting holds for agents outside Amethyst (over `amethyst mcp`) and for the `amethyst` command in any terminal too, since Amethyst can't tell your terminal from an agent's: only Amethyst's own window always has full control. Downloading or removing the debugger is only ever done from the window (Settings -> Unreal -> debugger).
