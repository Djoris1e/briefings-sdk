import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await rm('sdk-dist', { recursive: true, force: true });
await mkdir('sdk-dist', { recursive: true });
await build({ entryPoints: { index: 'src/briefing/index.ts', react: 'src/briefing/react.ts', server: 'src/briefing/server.ts' }, outdir: 'sdk-dist', bundle: true, splitting: true, format: 'esm', platform: 'neutral', target: 'es2022', jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'], sourcemap: true });
execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.sdk.json'], { stdio: 'inherit' });
await cp('public/audio-library', 'sdk-dist/audio-library', { recursive: true });
