interface Acceptance {
  version: string;
  at: string;
  via: 'installer' | 'app' | 'update';
}
interface LicenseRecord {
  accepted: Acceptance[];
}
interface LicenseText {
  version: string;
  text: string;
}

const versionOf = (text: string) => text.replace(/^﻿/, '').split(/\r?\n/)[1]?.trim() || '';

const readRecord = (raw: unknown): LicenseRecord => {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as LicenseRecord).accepted) ? (raw as LicenseRecord).accepted : [];
  return { accepted: list.filter((a) => a && typeof a.version === 'string' && typeof a.at === 'string') };
};

const accepted = (r: LicenseRecord, version: string) => !!version && r.accepted.some((a) => a.version === version);

const accept = (r: LicenseRecord, version: string, at: Date, via: Acceptance['via']): LicenseRecord =>
  !version || accepted(r, version) ? r : { accepted: [...r.accepted, { version, at: at.toISOString(), via }] };

const last = (r: LicenseRecord, version = '') => [...r.accepted].reverse().find((a) => !version || a.version === version) || null;

const blocks = (got: LicenseText | null | undefined, r: LicenseRecord) => (got && got.version && !accepted(r, got.version) ? got : null);

export { accept, accepted, blocks, last, readRecord, versionOf };
export type { Acceptance, LicenseRecord, LicenseText };
