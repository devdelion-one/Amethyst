const list: (() => void)[] = [];
export const onPlace = (fn: () => void) => void list.push(fn);
export const placeAll = () => list.forEach((fn) => fn());
