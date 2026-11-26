import type { Extension } from '@codemirror/state';
import type * as CM from '/vendor/codemirror.mjs';

export type Part = (L: typeof CM, name: string, abs: () => string | null) => Extension;
const parts: Part[] = [];

export const addCodePart = (p: Part) => void parts.push(p);
export type BarPart = (host: HTMLElement, name: string, abs: () => string | null) => (() => void) | void;
const bars: BarPart[] = [];
export const addBarPart = (p: BarPart) => void bars.push(p);
export const barParts = (host: HTMLElement, name: string, abs: () => string | null) => bars.map((p) => p(host, name, abs)).filter(Boolean) as (() => void)[];

export const codeParts = (L: typeof CM, name: string, abs: () => string | null): Extension[] => parts.map((p) => p(L, name, abs));
