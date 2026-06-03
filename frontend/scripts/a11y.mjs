/**
 * Axe-core accessibility gate (#130).
 *
 * Drives `@axe-core/cli` against the production build served by
 * `vite preview` on :4173. Run via `npm run a11y` (which wraps this
 * script with `start-server-and-test` so the preview is up before
 * axe attaches).
 *
 * Routes audited: the golden paths the SPA exposes — Home / Explorer /
 * a representative law detail / Graph / Chat / Settings / Dashboards.
 * Adding a route means editing `ROUTES` below.
 *
 * Failure mode:
 *   - Any axe violation tagged with one of `FAIL_TAGS` exits non-zero
 *     so the GitHub Actions step turns red.
 *   - Lower-severity findings (best-practice, experimental) print but
 *     don't gate — same calibration the rest of the project uses for
 *     lint warnings vs errors.
 *
 * Output: human-readable summary on stdout + a JSON artefact at
 * `frontend/axe-report.json` that the CI workflow uploads on failure
 * so a maintainer can read the offending nodes without re-running.
 */

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.resolve(here, '..', 'axe-report.json');

const BASE_URL = process.env.AXE_BASE_URL || 'http://localhost:4173';

// Routes worth gating. Keep short — long lists slow CI and most violations
// are layout-wide, so they surface from any one page anyway. SplashGate /
// WelcomeFlow / ModelWizard / Tutorial are intentionally not in the list:
// they need first-launch localStorage state that axe can't bootstrap.
const ROUTES = [
  '/home',
  '/explorer',
  '/graph',
  '/chat',
  '/dashboards',
  '/settings',
];

// The WCAG buckets we treat as blockers. `wcag2a` + `wcag2aa` is the
// project's published a11y target (see CONTRIBUTING + the Sprint 5
// audit). `best-practice` findings print as warnings only.
const FAIL_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// ─── Helpers ─────────────────────────────────────────────────────────────

function runAxe(url) {
  return new Promise((resolve, reject) => {
    const args = [
      url,
      '--load-delay',
      '1500',
      // @axe-core/cli accepts `chrome` / `chrome-headless` / `firefox` /
      // `safari` — NOT `chromium` (first CI run failed there). Use
      // `chrome-headless` so the CI runner doesn't try to open a
      // window.
      '--browser',
      'chrome-headless',
      '--exit',
      '--no-reporter',
      '--save',
      // axe-core/cli will overwrite for each route — we drain the
      // result before the next call writes over it.
      REPORT_PATH,
    ];
    const child = spawn('npx', ['axe', ...args], {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('close', (code) => {
      if (code !== 0 && code !== 2 /* axe uses 2 when violations were found */) {
        reject(new Error(`axe failed for ${url}: ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
    child.on('error', reject);
  });
}

async function readReport() {
  try {
    const { readFile } = await import('node:fs/promises');
    const body = await readFile(REPORT_PATH, 'utf8');
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function classifyViolations(report) {
  const blocking = [];
  const advisory = [];
  for (const route of report) {
    for (const violation of route.violations || []) {
      const targetSet = violation.tags?.some((t) => FAIL_TAGS.includes(t))
        ? blocking
        : advisory;
      targetSet.push({
        url: route.url,
        id: violation.id,
        impact: violation.impact,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: (violation.nodes || []).slice(0, 3).map((n) => ({
          target: n.target,
          failureSummary: n.failureSummary,
        })),
        nodeCount: (violation.nodes || []).length,
      });
    }
  }
  return { blocking, advisory };
}

function renderFinding(f) {
  return [
    `  [${f.impact}] ${f.id} — ${f.help}`,
    `    on: ${f.url}`,
    `    nodes affected: ${f.nodeCount}`,
    f.nodes.length ? `    first selector: ${f.nodes[0].target.join(' ')}` : null,
    `    help: ${f.helpUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────

const collected = [];
for (const route of ROUTES) {
  const url = `${BASE_URL}${route}`;
  process.stdout.write(`[a11y] auditing ${url}\n`);
  try {
    await runAxe(url);
  } catch (exc) {
    console.error(exc.message);
    process.exitCode = 1;
    continue;
  }
  const report = await readReport();
  if (Array.isArray(report)) {
    collected.push(...report);
  } else if (report) {
    collected.push(report);
  }
}

await writeFile(REPORT_PATH, JSON.stringify(collected, null, 2));

const { blocking, advisory } = classifyViolations(collected);

if (advisory.length) {
  console.log(`\n[a11y] ${advisory.length} advisory finding(s) (not blocking):`);
  advisory.forEach((f) => console.log(renderFinding(f)));
}

if (blocking.length) {
  console.log(`\n[a11y] ${blocking.length} BLOCKING finding(s) (WCAG 2.0/2.1 A/AA):`);
  blocking.forEach((f) => console.log(renderFinding(f)));
  console.error('\n[a11y] FAILED — fix the WCAG 2 A/AA violations above.');
  process.exit(1);
}

console.log(`\n[a11y] PASSED — no WCAG 2.0/2.1 A/AA violations across ${ROUTES.length} routes.`);
