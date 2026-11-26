const CORNERS = '<path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"/>';

export const FOCUS_ICON = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${CORNERS}<rect x="6" y="6" width="4" height="4" rx=".6" fill="currentColor" stroke="none"/></svg>`;
export const UNFOCUS_ICON = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${CORNERS}<path d="M5 5h2.2v2.2H5zM8.8 5H11v2.2H8.8zM5 8.8h2.2V11H5zM8.8 8.8H11V11H8.8z" fill="currentColor" stroke="none"/></svg>`;

export const focusTip = (name: string) => `Focus: ${name}\nShows only the folder ${name} in the explorer.`;
export const unfocusTip = (name: string) => `Focus: ${name}\nThe explorer shows only the folder ${name}. Click to show everything again.`;
export const NO_FOCUS_TIP = 'Focus\nShows only one folder in the explorer. Select a folder first.';
