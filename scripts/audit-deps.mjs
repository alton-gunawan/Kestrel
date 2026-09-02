/**
 * Dependency guard: MeetingOps must not contain an embedded LLM or forbidden
 * frameworks. See docs/00_TECH_STACK.md ("AI") and docs/01_BUILD_INSTRUCTIONS.md.
 * Run via `pnpm audit:deps`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const FORBIDDEN_PACKAGES = [
  /^(next|ai|langchain|langgraph|openai|anthropic)$/i,
  /^@ai-sdk\//i,
  /^@langchain\//i,
  /^@google\/generative-ai$/i,
  /vercel/i,
];

const FORBIDDEN_IMPORTS = [
  /\bfrom\s+['"](next|ai|langchain|langgraph|openai|anthropic)['"]/,
  /\bfrom\s+['"]@ai-sdk\/[\w.-]+['"]/,
  /\bfrom\s+['"]@langchain\/[\w.-]+['"]/,
  /\bimport\s*\(\s*['"](next|ai|langchain|openai)['"]\s*\)/,
  /require\(\s*['"](next|ai|langchain|openai)['"]\s*\)/,
];

const violations = [];

function checkPackageJson(pkgPath) {
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const depEntries = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ];
  for (const name of depEntries) {
    for (const pattern of FORBIDDEN_PACKAGES) {
      if (pattern.test(name)) {
        violations.push(`${pkgPath}: forbidden dependency "${name}"`);
      }
    }
  }
}

function checkSourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch {
    return; // directory may not exist yet
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!(entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) continue;
    const full = join(entry.parentPath ?? dir, entry.name);
    const content = readFileSync(full, 'utf8');
    for (const pattern of FORBIDDEN_IMPORTS) {
      if (pattern.test(content)) {
        violations.push(`${full}: forbidden import matching ${pattern}`);
      }
    }
  }
}

for (const pkg of [
  'package.json',
  'apps/web/package.json',
  'apps/api/package.json',
  'packages/contracts/package.json',
  'e2e/package.json',
]) {
  checkPackageJson(join(ROOT, pkg));
}

for (const dir of ['apps/web/src', 'apps/api/src', 'packages/contracts/src']) {
  checkSourceFiles(join(ROOT, dir));
}

if (violations.length > 0) {
  console.error('DEPENDENCY AUDIT FAILED:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('audit:deps PASS — no forbidden dependencies or imports.');
