import { parts } from '../base/parts.ts';

await Promise.all([parts('#modal', '#tip', '#colormenu'), import('./qterm.ts')]);
