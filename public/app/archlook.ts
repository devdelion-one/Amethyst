import { fileManager, ICONS } from '../base/controls.ts';
import { esc } from '../base/util.ts';

export const archiveTop = (): string =>
  `<div class="arc-top"><div class="arc-help">Nothing here is gone. Restore puts it back where it was, or at the top level if that place is gone. Deleting for good happens only here.</div><button class="outline arc-disk" title="Show in ${esc(fileManager())}&#10;Opens the folder the archived things are in." aria-label="show in ${esc(fileManager())}">${ICONS.reveal}</button></div>`;
