import esbuild from 'esbuild'
import path from 'node:path'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import madge from 'madge'

const madgeResult = await madge('./server/index.ts', {
  detectiveOptions: {
    ts: {
      skipTypeImports: true,
    },
  },
})

const circularDependencies = madgeResult.circular()

if (circularDependencies.length > 0) {
  circularDependencies.forEach((cycle) => {
    console.error('Circular dependency: ' + cycle.join(' → '))
  })

  process.exit(1)
}

const outDir = './dist'

rmSync(outDir, {
  recursive: true,
  force: true,
})

// dependencies that cannot be bundled
const externalDeps = [
  'isomorphic-dompurify',
  'argon2',
  'sqlite3',
  '@angular/material',
]

await esbuild.build({
  entryPoints: ['./server/index.ts'],
  bundle: true,
  platform: 'node',
  packages: 'bundle',
  format: 'esm',
  target: 'node24',
  outfile: path.join(outDir, 'index.mjs'),
  mainFields: ['module', 'main'],
  sourcemap: false,
  minifyWhitespace: true, // other minify options break things
  conditions: ['node'],
  banner: {
    js: [
      `import { createRequire as topLevelCreateRequire } from 'module'`,
      `import { fileURLToPath as topLevelFileURLToPath } from 'node:url'`,
      `import { dirname as topLevelDirname } from 'node:path'`,
      `const require = topLevelCreateRequire(import.meta.url)`,
      `const __filename = topLevelFileURLToPath(import.meta.url)`,
      `const __dirname = topLevelDirname(__filename)`,
    ].join('\n'),
  },
  // external packages that cannot be bundled plus whatever needs to be external to get bundle to run
  external: externalDeps.concat([
    'better-sqlite3',
    'mysql2',
    'mysql',
    'pg-query-stream',
    'tedious',
    'oracledb',
  ]),
}).catch(() => process.exit(1))

// Write a shim package.json with just the external dependencies,
// using the real package.json to get version information
const packagejson = JSON.parse(readFileSync('./package.json', 'utf-8')) as { dependencies: { [k: string]: string } }
const deps = packagejson.dependencies

const d: { [k: string]: string } = {}
for (const dep of externalDeps) {
  if (deps[dep]) {
    d[dep] = deps[dep]
  }
}
// Write the shim package.json to /dist, used in Dockerfile
writeFileSync('./dist/package.json', JSON.stringify({
  dependencies: d,
}))
