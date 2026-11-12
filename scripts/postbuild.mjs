// Makes the compiled CLI executable so `npx screenify` and the `bin` link work.
import { chmodSync } from 'node:fs';
chmodSync(new URL('../dist/cli.js', import.meta.url), 0o755);
