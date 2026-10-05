import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Paseo evaluates server bundles without a plugin-local __dirname. Directory
// installations retain this source path; regenerate it when moving the checkout.
const manifest = fileURLToPath(new URL('../package.json', import.meta.url));
await writeFile(new URL('./runtime-location.ts', import.meta.url), `export const runtimeLocation = ${JSON.stringify(manifest)};\n`);
