import fs from 'fs';
import path from 'path';

const png = path.join(import.meta.dirname, '..', 'brand', 'png');
const build = path.join(import.meta.dirname, 'build');
fs.mkdirSync(build, { recursive: true });
for (const [from, to] of [['amethyst-app-desktop-512.png', 'icon.png'], ['amethyst-app-desktop.ico', 'icon.ico'], ['amethyst-app-desktop.ico', 'app.ico']]) {
  fs.copyFileSync(path.join(png, from), path.join(build, to));
  console.log(`build/${to} from brand/png/${from}`);
}
