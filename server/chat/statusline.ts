type U = Record<string, any>;
export type Turn = { answered?: boolean; held?: U | null };
const LINE = /^(Info|Warning|Error): (\S[^\r\n]*?)\s*$/;

const noticeOf = (u: U) => {
  const m = LINE.exec(u.content.text)!;
  return { sessionUpdate: 'notice', severity: m[1].toLowerCase(), title: m[2] };
};

export function statusNotice(turn: Turn, u: U): U[] {
  if (u?.sessionUpdate !== 'agent_message_chunk' || u.content?.type !== 'text' || !u.content.text) return [u];
  const held = turn.held ? [noticeOf(turn.held)] : [];
  turn.held = null;
  if (!turn.answered && LINE.test(u.content.text)) {
    turn.held = u;
    return held;
  }
  turn.answered = true;
  return [...held, u];
}

export function heldText(turn?: Turn): U[] {
  const h = turn?.held;
  if (turn) turn.held = null;
  return h ? [h] : [];
}
