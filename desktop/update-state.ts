interface UpdateNow {
  status: string;
  next: string | null;
  stage: string;
  auto: boolean;
  started: string;
}

function settle(now: UpdateNow, next: string | null, asked = false, at = Date.now()) {
  const keep = { change: { checked: at }, get: false };
  if (now.status === 'downloading') return keep;
  const same = !next || next === now.next;
  if (now.status === 'ready' && (same || !(asked || now.auto))) return keep;
  if (now.status === 'failed' && now.stage === 'download' && same) return keep;
  const get = !!next && (now.auto || now.status === 'ready' || next === now.started);
  return { change: { status: next ? 'available' : 'idle', next, stage: '', error: '', checked: at }, get };
}

export { settle };
