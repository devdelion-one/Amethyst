# Agents from other models as subagents

Any chat in Amethyst can start another agent kind (`claude`, `codex`, `antigravity`, `cursor`, or `copilot`) as its own subagent. The subagent runs in the same project folder and appears under the parent chat in Agent Activity, with its own steps, answer, and short code (like `B73`).

## How to use it

Chats started by Amethyst are not told about Amethyst's commands, so your agent will not use them on its own. Ask your agent in plain words when you want a subagent from another model, for example:

> Use `amethyst agent run antigravity` with Gemini 4 Neon to review `src/auth.ts` for edge cases.

> Run a Claude Opus subagent with `amethyst agent run claude` to double-check this migration.

You can also run `amethyst help agent` from a terminal to see the full command help.

## Commands

All four commands run from inside an Amethyst chat's shell:

- `amethyst agent run <agent> <prompt>` — start a subagent (`claude`, `codex`, `antigravity`, `cursor`, or `copilot`) on a task and wait for its answer. Returns the answer under a header with its code (like `B73`), or returns the code immediately with `--background`.
- `amethyst agent send <code> <text>` — send a follow-up to one of your subagents. It keeps its earlier conversation and work.
- `amethyst agent wait <codes...>` — wait until one of the listed subagents finishes and return its answer.
- `amethyst agent stop <code>` — stop what a subagent is currently doing. It keeps what it did so far, and `amethyst agent send` can give it more work.

### Flags

`amethyst agent run` accepts these flags:

- `--model <name>` — pick a model the agent offers (e.g. `opus`, `sonnet`, `gemini-4-neon`, `gpt-5`).
- `--effort <level>` — pick a reasoning effort the agent offers (e.g. `low`, `medium`, `high`).
- `--mode <name>` — pick a permission or collaboration mode the agent offers (e.g. `default`, `plan`). One that may work without asking, such as `auto`, needs **chats answer other chats' permission asks** on.
- `--worktree` — run the subagent in its own git worktree.
- `--background` — return immediately with the subagent's code so you can launch several at once and collect them with `amethyst agent wait`.
- `--timeout <seconds>` — wait at most this many seconds before returning; without it, the command waits until the subagent finishes.

`amethyst agent send` also accepts `--background` and `--timeout <seconds>`, and `amethyst agent wait` accepts `--timeout <seconds>`.

## Examples

### From a Claude chat to Gemini 4 Neon (Antigravity)

```powershell
amethyst agent run antigravity "Review src/auth.ts for edge cases and list any bugs you find." --model gemini-4-neon --effort medium
```

### From an Antigravity (Gemini 4 Neon) chat to Claude

```powershell
amethyst agent run claude "Review src/auth.ts for edge cases and list any bugs you find." --model opus --effort medium
```

## Model names and effort

Pass the model's family name without an effort suffix, and pass the effort separately in `--effort`:

- Right: `--model gemini-4-neon --effort medium`
- Wrong: `--model gemini-4-neon-medium` (Amethyst refuses this and replies with the list of valid model names)

If you are not sure what models, efforts, or modes an agent offers, start a normal chat with that agent and run `amethyst chat options <code>` to list them.

## Follow-ups, parallel subagents, and stopping

To ask a subagent a follow-up question using the code it returned:

```powershell
amethyst agent send B73 "Also check how expired tokens are handled."
```

To run several subagents in parallel and wait for whichever finishes first:

```powershell
amethyst agent run antigravity "Check the server routes for race conditions." --model gemini-4-neon --effort medium --background
amethyst agent run codex "Check the client state updates for race conditions." --background
amethyst agent wait B73 H57
```

Call `amethyst agent wait` again with the remaining codes to collect the rest. To cancel a subagent mid-turn:

```powershell
amethyst agent stop B73
```

## Rules and limits

- **Chat-only:** `amethyst agent` commands only work from inside a chat started by Amethyst. From your own terminal, use `amethyst chat new` to start a normal chat instead.
- **No nesting:** a subagent cannot start its own subagents.
- **Permission asks:** if a subagent asks for permission to run a command or edit a file, the prompt forwards to the parent chat for you to approve or deny. No chat or outside agent can answer it for you unless you allow it in settings.
- **Lifecycle:** cancelling or closing the parent chat stops its running subagents.

## Turning it off

To disable Amethyst's CLI tools or adjust what chats can do, open **Settings -> Agents -> Amethyst tools**.
