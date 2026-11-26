import type { Act } from '../base/acts.ts';

const AT = (about: string) => ({ name: 'at', type: 'string', pos: true, required: true, about }) as const;
const FRAME = { name: 'frame', type: 'number', about: 'The frame: its number in amethyst debug stack (#0 is where it stopped, the default)' } as const;

export const ACTIONS: Act[] = [
  {
    name: 'debug status',
    tool: 'debug_status',
    about: "The debugger in this project: not debugging, building, running, or stopped, and then why (a breakpoint, a step, a crash, check() or ensure() failed, a value changed), where (file:line, function and the line's code), and whether an agent did it. Also how many breakpoints are set.",
    args: [],
    route: 'POST /api/debug/state',
  },
  {
    name: 'debug stop',
    tool: 'debug_stop',
    about: "Stop debugging. By default it detaches: Unreal Editor (or the game) keeps running, with its unsaved work. With end: true it ends the program instead, and unsaved work in Unreal Editor is lost: only do that when the user asked for it.",
    args: [{ name: 'end', type: 'boolean', about: 'End the program instead of detaching: unsaved work in Unreal Editor is lost' }],
    route: 'POST /api/debug/stop',
    example: 'amethyst debug stop',
  },
  {
    name: 'debug continue',
    tool: 'debug_continue',
    about: 'Let the stopped program run on. It returns at once; amethyst debug wait returns at the next stop.',
    args: [],
    route: 'POST /api/debug/continue',
  },
  {
    name: 'debug pause',
    tool: 'debug_pause',
    about: "Stop the running program where it is (on Unreal's GameThread when the pause lands elsewhere). Returns where it stopped.",
    args: [],
    route: 'POST /api/debug/pause',
  },
  {
    name: 'debug step',
    tool: 'debug_step',
    about: 'Step the stopped program one line: over (the default) runs calls on this line without stopping in them, into goes into the call, out runs to the end of this function. Returns where it stopped next.',
    args: [{ name: 'how', type: 'string', pos: true, about: 'over (the default), into or out' }],
    route: 'POST /api/debug/step',
    example: 'amethyst debug step into',
  },
  {
    name: 'debug break',
    tool: 'debug_breakpoints',
    about: "Breakpoints in this project. With at: set one at file:line (a path in the project, or just the file's name when it's the only one), with if: only when that C++ condition is true. With remove: take the one at file:line away. With neither: list them, each with whether it's bound (or waiting for its module to load), its hits and who set it. The program stops there next time the line runs.",
    args: [
      { name: 'at', type: 'string', pos: true, about: 'Set a breakpoint at file:line, e.g. Source/Game/Pix.cpp:10 or Pix.cpp:10' },
      { name: 'if', type: 'string', about: 'A C++ condition: stop only when it is true, e.g. Health < 0' },
      { name: 'remove', type: 'string', about: 'Remove the breakpoint at file:line' },
      { name: 'list', type: 'boolean', about: 'Only list them (the default with no at or remove)' },
    ],
    route: 'POST /api/debug/breakpoints',
    example: 'amethyst debug break Pix.cpp:10 --if "Health < 0"',
  },
  {
    name: 'debug stack',
    tool: 'debug_stack',
    about: "The call stack where the program stopped, one frame a line: #N function  file:line. Engine frames are marked (engine) and long runs of them fold into one line unless all is true; Blueprint frames show as [Blueprint] BP_Name · Function (the object). Use the numbers with amethyst debug vars and amethyst debug eval.",
    args: [
      { name: 'all', type: 'boolean', about: 'Every engine frame, not folded' },
      { name: 'thread', type: 'number', about: 'Another thread by its id (default: the one that stopped)' },
    ],
    route: 'POST /api/debug/stack',
  },
  {
    name: 'debug vars',
    tool: 'debug_variables',
    about: "The variables of a frame while stopped (the locals, with this), as an indented tree: name = value · type, Unreal types read as in Visual Studio (FString as its text, TArray as Num=N with its items, UObject as Name (Class)). {…} means it opens further with a larger depth.",
    args: [FRAME, { name: 'depth', type: 'number', about: 'How many levels to open, 1 to 4 (default 2)' }],
    route: 'POST /api/debug/scopes',
    example: 'amethyst debug vars --frame 1 --depth 3',
  },
  {
    name: 'debug eval',
    tool: 'debug_evaluate',
    about: "Evaluate a C++ expression in a frame while stopped, e.g. Health, this->Weapon or Items.Num. Returns its value and type, and its members when it has some. An expression with a call or an assignment could change the program: that needs the user's \\\"agents can control the debugger\\\". While the user has \"chats answer other chats' permission asks\" off, an expression with a call or an assignment first waits for their OK in Amethyst's window.",
    args: [
      { name: 'expr', type: 'string', pos: true, rest: true, required: true, about: 'The expression' },
      FRAME,
      { name: 'depth', type: 'number', about: 'How many levels of its members to show, 0 to 3 (default 0: one level)' },
    ],
    route: 'POST /api/debug/eval',
    example: 'amethyst debug eval this->Health',
  },
  {
    name: 'debug wait',
    tool: 'debug_wait',
    about: 'Wait until the program stops (a breakpoint, a step, a crash) or debugging ends, then say where and why, as amethyst debug status does. Returns at once if it is stopped already. After ms (default 30000, at most 900000) it says it is still running: call it again to keep waiting.',
    args: [{ name: 'ms', type: 'number', about: 'How long to wait, in milliseconds (default 30000)' }],
    route: 'POST /api/debug/wait',
    example: 'amethyst debug wait --ms 60000',
  },
  {
    name: 'debug goto',
    tool: 'debug_goto',
    about: "Set the next statement: while stopped, move the program to another line of the same function (file:line). Code skipped or run again is not undone. The adapter refuses a line outside the function, and says why.",
    args: [AT('The line to run next: file:line, in the function where it stopped')],
    route: 'POST /api/debug/goto',
    example: 'amethyst debug goto Pix.cpp:12',
  },
  {
    name: 'debug runto',
    tool: 'debug_run_to',
    about: 'Run until the program reaches file:line (a breakpoint there for this once only, never saved), or stops anywhere else first. It returns at once; amethyst debug wait returns when it gets there.',
    args: [AT('Where to run to: file:line')],
    route: 'POST /api/debug/runto',
    example: 'amethyst debug runto Pix.cpp:20',
  },
];
