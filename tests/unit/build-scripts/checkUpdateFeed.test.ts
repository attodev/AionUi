// fork(update): tests for the update address build check script — see docs/fork/update-feed-overlay.md

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/fork/check-update-feed.sh';
const ADDR = 'https://updates.example.com/aionui';

let root: string;
let out: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'check-feed-'));
  out = join(root, 'out');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, content: string) {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const bundle = (addr: string) => `const a = "${addr}";\nexport { a };\n`;
const SENTINEL = 'const UPDATE_FEED_SENTINEL_URL = "https://update.invalid/releases";\n';
const realistic = (addr: string) => `${SENTINEL}const U = resolveUpdateBaseUrl("${addr}");\n`;

function run(...args: string[]) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, AIONUI_UPDATE_BASE_URL: '' },
  });
  return { code: r.status, err: r.stderr };
}

describe('check-update-feed.sh', () => {
  it('passes when the main bundle carries the expected address', () => {
    put('main/index.js', bundle(ADDR));
    expect(run(out, ADDR).code).toBe(0);
  });

  it('normalizes a trailing slash in the expected address', () => {
    put('main/index.js', bundle(ADDR));
    expect(run(out, `${ADDR}/`).code).toBe(0);
  });

  it('passes when the sentinel constant is present alongside the correct address', () => {
    put('main/index.js', realistic(ADDR));
    expect(run(out, ADDR).code).toBe(0);
  });

  it('fails for a sentinel-only build', () => {
    put('main/index.js', `${SENTINEL}const U = resolveUpdateBaseUrl("https://update.invalid/releases");\n`);
    const r = run(out, ADDR);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--force');
    expect(r.err).toContain('sentinel');
  });

  it('fails when the address is only a prefix of a longer one', () => {
    put('main/index.js', bundle(`${ADDR}2`));
    expect(run(out, ADDR).code).toBe(1);
    put('main/index.js', bundle(`x${ADDR}`));
    expect(run(out, ADDR).code).toBe(1);
  });

  it('fails when the define was not applied', () => {
    put('main/index.js', `${bundle(ADDR)}const e = process.env.AIONUI_UPDATE_BASE_URL;\n`);
    expect(run(out, ADDR).code).toBe(1);
  });

  it('fails when the expected address is missing from the bundle', () => {
    put('main/index.js', bundle('https://other.example.com/x'));
    const r = run(out, ADDR);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--force');
  });

  it('fails when the upstream host is still present', () => {
    put('main/index.js', bundle(ADDR) + bundle('https://static.aionui.com/releases'));
    const r = run(out, ADDR);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--force');
  });

  it('fails without an expected address', () => {
    put('main/index.js', bundle(ADDR));
    expect(run(out).code).toBe(1);
  });

  it('fails without out/main', () => {
    mkdirSync(out);
    const r = run(out, ADDR);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--force');
  });

  it('version check', () => {
    put('main/index.js', bundle(ADDR));
    put('renderer/assets/a.js', 'const v = "2.2.3";');
    expect(run(out, ADDR, '2.2.3').code).toBe(0);
    const bad = run(out, ADDR, '9.9.9');
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('--force');
  });
});
