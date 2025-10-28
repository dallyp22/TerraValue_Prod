import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Build the Vercel serverless function
await build({
  entryPoints: [join(__dirname, 'api/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: join(__dirname, 'api/index.js'),
  external: [
    // Keep these external as Vercel provides them
    '@neondatabase/serverless',
    'ws',
    'bufferutil'
  ],
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
  }
});

console.log('✅ Vercel function built successfully');

