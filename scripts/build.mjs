import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive: true });
for (const asset of ['moon.webp', 'relief.webp']) await cp(`public/${asset}`, `dist/${asset}`);
await mkdir('dist/data', { recursive: true });
const scientific = ['horizons', 'ephemeris', 'dsn', 'terrain-receipt', 'sky-receipt', 'visual-receipt'];
for (let index = 0; index < 9; index++) scientific.push(`terrain-${index}`);
for (const name of scientific) await cp(`public/data/${name}.json`, `dist/data/${name}.json`);
console.log('Built static SELENE site in dist/');
