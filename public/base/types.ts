export type Kind = 'code' | 'board' | 'file';

export interface FileMeta {
  seen?: number;
  created?: number;
  rank?: number;
  ring?: number;
  [key: string]: unknown;
}

export interface FileInfo {
  path: string;
  name: string;
  title: string;
  kind: Kind;
  size: number;
  mtime: number;
  meta: FileMeta;
}

export interface TreeNode {
  path: string;
  name: string;
  dirs: TreeNode[];
  files: FileInfo[];
  cut?: number;
  hidden?: number;
}

export type Pin =
  | { kind: 'file'; path: string }
  | { kind: 'chat'; session: string; program: 'claude' | 'codex' | 'antigravity' | 'cursor' | 'copilot' | 'grok'; title?: string }
  | { kind: 'term'; id: string; title?: string };

export interface Tree {
  root: TreeNode;
  order: string[];
  layout: Record<string, unknown>;
  dirs: Record<string, Record<string, unknown>>;
  pins?: Pin[];
  marks?: Record<string, number>;
}

export interface Note extends FileInfo {
  dir: string;
  board: boolean;
  code: boolean;
  file: boolean;
  touched: number;
  color: string | null;
}

export interface Folder {
  kind: 'inbox' | 'folder';
  id?: string;
  path: string;
  loc: string;
  name: string;
  parent: string | null;
  meta?: Record<string, unknown>;
  missing?: boolean;
  thoughts: Note[];
  kids: Folder[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  desc: string;
  color: string | null;
  missing?: boolean;
  count?: number;
  touched?: number;
}

export interface Workspace {
  id: string;
  name: string;
  home: boolean;
  loose?: boolean;
  dir: string;
  suggest: string;
  projects: Project[];
  desc: string;
}

export interface WorkspaceEntry {
  id: string;
  name: string;
  path: string;
  home: boolean;
  missing: boolean;
  projects: { name: string; color: string | null }[];
  pin?: number | null;
  [key: string]: unknown;
}

export interface OpenFile {
  tab?: string | null;
  path: string | null;
  dir?: string;
  board?: boolean;
  scratch?: boolean;
  mode?: string;
  title: string;
  reqTitle?: string;
  content: string;
  disk?: string;
  mtime?: number | null;
  touched?: number;
  meta: FileMeta;
  autoTitle: boolean;
  dirtyContent?: boolean;
  dirtyTitle?: boolean;
  clash?: boolean;
  [key: string]: unknown;
}

export interface FloatTabs {
  pid?: string;
  tabs: any[];
  on: string | null;
  min?: boolean;
}

export interface Tab {
  id: string;
  type: string;
  path: string | null;
  abs?: string;
  url?: string;
  chat?: string;
  rev?: string;
  pane?: string;
  term?: string;
  title?: string | null;
  preview?: boolean;
  resume?: string;
  draft?: string;
  dir?: string;
}

export interface TabGroup {
  g: string;
  tabs: Tab[];
  on: string | null;
  id?: undefined;
  split?: undefined;
  kids?: undefined;
  sizes?: undefined;
}

export interface TabSplit {
  g?: undefined;
  tabs?: undefined;
  on?: undefined;
  id: string;
  split: string;
  kids: TabNode[];
  sizes: number[];
}

export type TabNode = TabGroup | TabSplit;

export interface Layout {
  id: string;
  root: TabNode;
  active: string | null;
  name?: string;
  color?: string;
  mark?: string;
}

export interface State {
  wid: string;
  pid: string;
  wsEditor: boolean;
  switching: boolean;
  ws: Workspace | null;
  projects: Project[];

  workspaces: WorkspaceEntry[];
  wsNewSuggest: string;
  wsSuggest: string;
  data: Tree | null;
  roots: Folder[];
  inbox: Folder | null;
  thoughts: Map<string, Note>;
  dirs: Map<string, Folder>;
  cut: number;
  hidden: number;

  side: boolean;
  sideView: string;
  ctx: string;
  solo: string | null;

  collapsed: Set<string>;
  expanded: Set<string>;

  picked: string | null;
  marked: Set<string>;

  open: OpenFile | null;
  boardWide: boolean;
  saving: Promise<unknown>;
  saveTimer: number;

  pages: FloatTabs | null;

  settingsOpen: boolean;

  archive: any[];
  query: string;
  hits: Set<string> | null;

  pins: Pin[];
  marks: Record<string, number>;

  dragging: string | null;
}

export type AskCard = { id: string; q: string; why: string; what: string; files: { path: string; add?: number; del?: number; fresh?: boolean }[]; options: { optionId: string; name: string; kind?: string }[]; form?: { message: string; schema: unknown } };
export type SubSummary = { id: string; name: string; type?: string; status: string; now?: string; why?: string; start: number; end?: number };
export interface AgentInfo {
  id: string;
  kind: string;
  program?: string;
  title: string;
  status: string;
  line: string;
  step?: string;
  model?: string;
  at: number;
  started?: number;
  session?: string | null;
  am?: number;
  wt?: string | null;
  subs?: SubSummary[];
  ask?: AskCard | null;
  place?: ChatPlace;
  draft?: ChatDraft;
  review?: ChatReview;
  report?: boolean;
  cacheOff?: boolean;
  note?: string;
  rang?: { at: number; why: string } | null;
  pid: string;
  project: string;
}
export type ChatSpot = { set?: string; ed?: string; orch?: boolean };
export type ChatPlace = ChatSpot & { near?: string; go: boolean; from: number; at: number };
export type ChatDraft = { text: string; at: number };
export type ChatReview = { path: string | null; at: number };

export type ChatModes = { currentModeId?: string; availableModes: { id: string; name: string; description?: string }[] };
export type ChatConfig = { id: string; name: string; category?: string; description?: string; type: string; currentValue: unknown; options?: any[] };
export type ChatImage = { path: string; [k: string]: unknown };
export type AgentContent = { type: 'text'; text: string } | { type: 'image'; data?: string; mimeType?: string } | { type: 'resource' | 'resource_link'; [k: string]: unknown };
export type ChatWorktree = { path: string; cwd: string; root?: string; branch: string; base: string; from?: string; gone?: boolean; copied?: string[]; left?: number; carried?: number };
export type Artifact = { path: string; name: string; summary: string; requestFeedback: boolean; kind: 'doc' | 'image' };
type UpdateBase = { messageId?: string; toolCallId?: string; status?: string; _meta?: Record<string, any> };
export type AgentUpdate = UpdateBase &
  (
    | { sessionUpdate: 'agent_message_chunk' | 'agent_thought_chunk' | 'user_message_chunk'; content: AgentContent }
    | { sessionUpdate: 'tool_call' | 'tool_call_update'; content?: any[]; title?: string; kind?: string; rawInput?: any; rawOutput?: any; locations?: any }
    | { sessionUpdate: 'plan'; entries: { status: string; content: string }[] }
    | { sessionUpdate: 'artifacts'; artifacts: Artifact[] }
    | { sessionUpdate: 'usage_update'; used: number; size: number; cost?: { amount: number; currency: string } | null }
    | { sessionUpdate: 'available_commands_update'; availableCommands: { name: string; description?: string; run?: boolean }[] }
    | { sessionUpdate: 'current_mode_update'; currentModeId: string }
    | { sessionUpdate: 'config_option_update'; configOptions: ChatConfig[] }
    | { sessionUpdate: 'session_info_update'; title?: string }
    | { sessionUpdate: 'compaction_update' | 'compaction_summary_chunk' | 'notice'; [k: string]: any }
  );
type At = { at?: number };
export type ChatEvent = At &
  (
    | { type: 'status'; state: 'starting' | 'ready' | 'error'; text: string; signIn?: boolean; update?: boolean; agent?: unknown; program?: string; modes?: ChatModes | null; configOptions?: ChatConfig[]; canList?: boolean; auth?: { line?: string | null } | null; [k: string]: unknown }
    | { type: 'you'; text: string; qid: string; images?: ChatImage[]; ctx?: { lines?: number; path: string } | null; handoff?: { from: string; to: string; since: number; turns: number }; from?: string }
    | { type: 'queued'; qid: string; text: string; images?: ChatImage[]; from?: string }
    | { type: 'unqueued'; qids: string[]; back?: boolean }
    | { type: 'unsent'; qid: string; text: string; images?: ChatImage[] }
    | { type: 'switch'; from: string; to: string }
    | { type: 'shrinkMode'; on: boolean }
    | { type: 'shrink'; state: 'start' | 'done' | 'failed' | 'stopped'; from?: string; to: string; before?: number; after?: number; file?: string; text?: string }
    | { type: 'worktree'; wt: ChatWorktree | null }
    | { type: 'wtstep'; step: 'making' | 'starting' }
    | { type: 'renamed'; title: string; mine: boolean }
    | { type: 'update'; update: AgentUpdate; [k: string]: unknown }
    | { type: 'ask'; ask: string; toolCall?: any; options: { kind: string; optionId: string; name: string }[]; form?: undefined }
    | { type: 'ask'; ask: string; toolCall?: any; form: { message: string; schema: unknown }; options?: unknown[] }
    | { type: 'answered'; ask: string; optionId: string | null }
    | { type: 'own'; line?: string }
    | { type: 'turn'; stopReason: string; text?: string; signIn?: boolean; own?: boolean; since?: number }
    | { type: 'end'; why?: string }
    | { type: 'history'; events: ChatEvent[] }
  );

export type RouteHandler = (body: any, query?: URLSearchParams, extra?: any, pid?: string, root?: any, am?: number, gone?: AbortSignal) => unknown;
export type Routes = Record<string, RouteHandler>;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiffNote {
  side: 'old' | 'new';
  line: number;
  html: string;
}
export interface DiffNotes {
  list: DiffNote[];
  write?: (side: 'old' | 'new', line: number, text: string) => Promise<string | null>;
  hint?: string;
}
export type PartState = boolean | 'part' | null;
export interface DiffParts {
  list: PartState[];
  runs: number[];
  gen: () => number;
  act: (what: 'stage' | 'unstage' | 'discard' | 'undo' | 'fresh', k?: number) => Promise<{ oldText?: string; newText?: string; line?: string; undo?: boolean; err?: boolean }>;
}
export interface FileDiff {
  path: string;
  notes?: DiffNotes;
  parts?: DiffParts;
  oldText?: string | null;
  newText?: string | null;
  rel?: string | null;
}

interface UpdateBridge {
  state(): Promise<any>;
  onState(fn: (s: any) => void): void;
  seen(): Promise<any>;
  check(): Promise<any>;
  download(): Promise<any>;
  cancel(): Promise<any>;
  install(): Promise<any>;
  set(o: { look: boolean; auto: boolean }): Promise<any>;
}

export interface UsageNow {
  on: boolean | null;
  asked: boolean;
  sent: { at: number; query: string } | null;
  version: string;
  dev: boolean;
  to: string;
}

interface UsageBridge {
  state(): Promise<UsageNow>;
  onState(fn: (s: UsageNow) => void): void;
  set(o: { on?: boolean | null; asked?: boolean }): Promise<UsageNow>;
}

export type ReportRing = { id: string; code: string; title: string; line: string; text?: string; why: 'done' | 'error' | 'asks' | 'cold'; am: number; ask: { q: string; options: string[] } | null };
interface ReportBridge {
  onRing(fn: (r: ReportRing) => void): void;
  onGo(fn: (id: string) => void): void;
  open(id: string, am?: number): void;
  act?(what: 'size' | 'close' | 'go', n?: number): void;
  seen?(id: string): void;
  onUnring?(fn: (id: string) => void): void;
  noticeScreen?(v: string): void;
  cacheNotice?(on: boolean): void;
}

export interface LicenseNow {
  version: string;
  text: string;
  accepted: boolean;
  last: { version: string; at: string; via: string } | null;
  update: { next: string; version: string; text: string } | null;
  site: string;
}

export interface LicenseBridge {
  state(): Promise<LicenseNow>;
  onState(fn: (s: LicenseNow) => void): void;
  accept(version: string): Promise<LicenseNow>;
}

interface DesktopBridge {
  desktop: true;
  webview: true;
  setGround(color: string): void;
  hitchLog(lines: unknown): void;
  hitchMetrics(why: string): void;
  hitchWindow(on?: boolean | null | 'ask'): Promise<any>;
  onHitchPop(fn: (on: boolean) => void): void;
  hitchTail(): Promise<any>;
  onHitch(fn: (text: string) => void): void;
  hitchFolder(): Promise<any>;
  hitchSnapshot(): Promise<any>;
  hitchRecord(): Promise<any>;
  onHitchDump(fn: () => Record<string, unknown>): void;
  onBrowserOpen(fn: (d: any) => void): void;
  onBrowserZoom(fn: (d: any) => void): void;
  capturePage(id: number | string): Promise<any>;
  pickFolder(opts?: { title?: string; defaultPath?: string }): Promise<any>;
  pickFiles(): Promise<any>;
  clipboardFiles(): Promise<any>;
  edit(what: 'cut' | 'copy' | 'paste' | 'selectAll'): void;
  pathOf(file: File): string;
  onFiles(fn: () => void): void;
  takeFiles(): Promise<any>;
  defaultApps(): Promise<any>;
  newAmethyst(): Promise<any>;
  amethysts(): Promise<any>;
  openAmethyst(n: number): Promise<any>;
  forgetAmethyst(n: number): Promise<any>;
  trayState(): Promise<any>;
  traySet(c: { on?: boolean; login?: boolean }): Promise<any>;
  forgetWindow(at?: (Box & { near?: boolean }) | null | false): Promise<any>;
  onForgetPop(fn: (on: boolean) => void): void;
  forgetGuide(on?: boolean | null): Promise<any>;
  forgetToast(o: { text?: string; level?: number; id?: string; again?: string; from?: string }): Promise<any>;
  forgetList(list: unknown): Promise<any>;
  toastAct(what: string): void;
  onForgetAct(fn: (what: string) => void): void;
  quickWindow(kind: string, at?: Box | 'show' | null): Promise<any>;
  onQuickPop(fn: (kinds: string[]) => void): void;
  minimizeWindow(): Promise<any>;
  claimSpare(of: string): Promise<any>;
  atProject(wid: string, pid: string): Promise<any>;
  windowAlive(of: string, n: number): Promise<any>;
  quickOf?(): Promise<number>;
  soloFront?(kind: string): Promise<number>;
  showWindow(kind?: string, focus?: boolean): Promise<any>;
  focusPid?(pid: number): Promise<any>;
  flash?(): Promise<any>;
  onAway(fn: (kinds: string[]) => void): void;
  sizeWindow(k: number): Promise<any>;
  zoomWindow(): Promise<any>;
  osWindow(what: 'max' | 'ask' | 'min'): Promise<any>;
  onSize(fn: (k: any) => void): void;
  dragWindow(phase: string, color?: string): void;
  onAskClose(fn: () => void): void;
  closeWindow(answer: boolean | 'asking'): void;
  holdClose(): boolean;
  closeHeld(): Promise<any>;
  update: UpdateBridge;
  usage: UsageBridge;
  report?: ReportBridge;
  license: LicenseBridge;
}

declare global {
  interface Window {
    amethyst?: DesktopBridge;
    __amPick?: { cancel(): void };
    mind?: { S: State; web: any; tabs: any; bound: any; pooled: any };
  }
}
