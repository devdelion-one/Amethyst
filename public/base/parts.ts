export async function parts(...sels: string[]) {
  const app = new DOMParser().parseFromString(await (await fetch('/app.html?raw=1')).text(), 'text/html');
  for (const sel of sels) {
    const el = app.querySelector(sel);
    if (el) document.body.append(el);
  }
}
