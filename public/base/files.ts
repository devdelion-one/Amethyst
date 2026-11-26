export const TEXT_EXT = /\.(txt|md)$/i;
export const BOARD_EXT = /\.svg$/i;
const SORTS: [string, RegExp][] = [['page', /\.html?$/i], ['image', /\.(png|jpe?g|gif|webp|bmp|svg)$/i], ['pdf', /\.pdf$/i]];
export const sortOf = (name: string) => SORTS.find(([, re]) => re.test(name || ''))?.[0] || 'other';
export const RUNS = /\.(exe|com|bat|cmd|ps1|psm1|msi|msp|lnk|scr|vbs|vbe|wsf|wsh|hta|jar|reg|cpl|url|appref-ms)$/i;
export const MAX_PATHS = 50;
