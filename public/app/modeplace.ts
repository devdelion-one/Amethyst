export const PLACE_AT: Record<string, [number, string]> = { '': [15, 'explorer'], left: [3, 'left'], center: [21, 'center'], slots: [3, 'slots'] };
export const placePic = (v: string) => (v === 'slots' ? [3, 11, 27].map((l) => `<u style="left:${l}px;width:7px"></u>`).join('') + '<u class="pl-free" style="left:19px;width:7px"></u>' : `<u style="left:${PLACE_AT[v]?.[0] ?? 3}px"></u>`);

const BIG: Record<string, number[]> = { '': [27, 37, 47], left: [3, 13, 23], center: [40, 50, 60], slots: [3, 13, 33] };
export const placeBar = (v: string) => (BIG[v] || BIG.left).map((l) => `<u style="left:${l}%"></u>`).join('') + (v === 'slots' ? '<u class="pl-free" style="left:23%"></u>' : '');
