// fork(update): tests for the update feed publishing script — see docs/fork/update-feed-overlay.md

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/fork/publish-update-feed.sh';
const sha = (buf: Buffer) => createHash('sha512').update(buf).digest('base64');

let root: string;
let out: string;
let feed: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'update-feed-'));
  out = join(root, 'out');
  feed = join(root, 'feed');
  mkdirSync(out);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

type YmlOpts = { version?: string; url?: string; hash?: string; quote?: boolean };

/** Writes an installer and a yml shaped like electron-builder's; returns the installer content. */
function makeRelease(ymlName: string, name: string, content: string, opts: YmlOpts = {}) {
  const buf = Buffer.from(content);
  writeFileSync(join(out, name), buf);
  const q = (s: string) => (opts.quote ? `'${s}'` : s);
  const hash = opts.hash ?? sha(buf);
  const yml = [
    `version: ${opts.version ?? '2.2.3'}`,
    'files:',
    `  - url: ${q(opts.url ?? name)}`,
    `    sha512: ${hash}`,
    `    size: ${buf.length}`,
    `path: ${name}`,
    `sha512: ${hash}`,
    "releaseDate: '2026-11-17T08:55:10.937Z'",
    '',
  ].join('\n');
  writeFileSync(join(out, ymlName), yml);
  return yml;
}

const run = (...extra: string[]) => spawnSync('bash', [SCRIPT, out, feed, ...extra], { encoding: 'utf8' });
const listFeed = (dir = feed): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((n) =>
        statSync(join(dir, n)).isDirectory() ? listFeed(join(dir, n)).map((c) => `${n}/${c}`) : [n]
      )
    : [];

describe('publish-update-feed.sh', () => {
  it('publishes installer then yml', () => {
    const yml = makeRelease('latest-linux.yml', 'AionUi-2.2.3-linux-amd64.deb', 'deb-bytes');
    const r = run();
    expect(r.status).toBe(0);
    expect(readFileSync(join(feed, '2.2.3/AionUi-2.2.3-linux-amd64.deb'), 'utf8')).toBe('deb-bytes');
    expect(readFileSync(join(feed, 'latest-linux.yml'), 'utf8')).toBe(yml);
    expect(r.stdout.trim().split('\n').pop()).toContain('Upload this folder');
  });

  it('writes yml last', () => {
    makeRelease('latest-linux.yml', 'a-2.2.3.deb', 'one');
    makeRelease('latest.yml', 'b-2.2.3.exe', 'two');
    makeRelease('latest-mac.yml', 'c-2.2.3.zip', 'three');
    const r = run();
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n').slice(0, -1);
    const lastInstaller = Math.max(...lines.map((l, i) => (l.startsWith('2.2.3/') ? i : -1)));
    const firstYml = Math.min(...lines.map((l, i) => (l.startsWith('latest') ? i : 999)));
    expect(lastInstaller).toBeLessThan(firstYml);
    expect(lines.filter((l) => l.startsWith('latest'))).toHaveLength(3);
    // a failure case also leaves no yml
    rmSync(feed, { recursive: true });
    makeRelease('latest.yml', 'b-2.2.3.exe', 'two', { hash: 'bad' });
    expect(run().status).toBe(1);
    expect(listFeed().filter((f) => f.endsWith('.yml'))).toEqual([]);
  });

  it('rejects a sha512 mismatch and writes nothing', () => {
    makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'content', { hash: 'AAAA' });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/sha512/i);
    expect(listFeed()).toEqual([]);
  });

  it('all or nothing across platforms', () => {
    makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'good');
    makeRelease('latest.yml', 'x-2.2.3.exe', 'bad', { hash: 'AAAA' });
    expect(run().status).toBe(1);
    expect(listFeed()).toEqual([]);
  });

  it('rejects a yml that lists a missing installer', () => {
    makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'good');
    rmSync(join(out, 'x-2.2.3.deb'));
    const r = run();
    expect(r.status).toBe(1);
    expect(listFeed()).toEqual([]);
  });

  it.each([
    ['version: v prefix', { version: 'v2.2.3' }],
    ['version: banana', { version: 'banana' }],
    ['url with a path', { url: 'sub/dir/file.deb' }],
  ])('rejects bad yml shapes (%s)', (_label, opts) => {
    makeRelease('latest-linux.yml', 'file.deb', 'x', opts);
    expect(run().status).toBe(1);
    expect(listFeed()).toEqual([]);
  });

  it('accepts quoted values and several files per yml', () => {
    const a = Buffer.from('installer');
    const b = Buffer.from('zip');
    writeFileSync(join(out, 'app.dmg'), a);
    writeFileSync(join(out, 'app.zip'), b);
    writeFileSync(
      join(out, 'latest-mac.yml'),
      `version: '2.2.3'\nfiles:\n  - url: "app.dmg"\n    sha512: "${sha(a)}"\n    size: 9\n    blockMapSize: 5\n  - url: app.zip\n    sha512: ${sha(b)}\n    size: 3\npath: app.zip\nsha512: ${sha(b)}\n`
    );
    expect(run().status).toBe(0);
    expect(listFeed().sort()).toEqual(['2.2.3/app.dmg', '2.2.3/app.zip', 'latest-mac.yml']);
  });

  it('fails when there is no latest*.yml', () => {
    expect(run().status).toBe(1);
    expect(listFeed()).toEqual([]);
  });

  it('is idempotent', () => {
    makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'same');
    expect(run().status).toBe(0);
    const first = listFeed().map((f) => readFileSync(join(feed, f), 'utf8'));
    expect(run().status).toBe(0);
    expect(listFeed().map((f) => readFileSync(join(feed, f), 'utf8'))).toEqual(first);
    expect(listFeed().filter((f) => f.includes('tmp'))).toEqual([]);
  });

  it('refuses to change a published version', () => {
    makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'first');
    expect(run().status).toBe(0);
    const yml2 = makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'second');
    const r = run();
    expect(r.status).toBe(1);
    expect(readFileSync(join(feed, '2.2.3/x-2.2.3.deb'), 'utf8')).toBe('first');
    expect(readFileSync(join(feed, 'latest-linux.yml'), 'utf8')).not.toBe(yml2);
    expect(run('--overwrite').status).toBe(0);
    expect(readFileSync(join(feed, '2.2.3/x-2.2.3.deb'), 'utf8')).toBe('second');
    expect(readFileSync(join(feed, 'latest-linux.yml'), 'utf8')).toBe(yml2);
  });

  it('keeps older versions', () => {
    makeRelease('latest-linux.yml', 'x-2.2.2.deb', 'old', { version: '2.2.2' });
    expect(run().status).toBe(0);
    makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'new');
    expect(run().status).toBe(0);
    expect(existsSync(join(feed, '2.2.2/x-2.2.2.deb'))).toBe(true);
    expect(existsSync(join(feed, '2.2.3/x-2.2.3.deb'))).toBe(true);
  });

  it('copies blockmaps when present', () => {
    makeRelease('latest.yml', 'x-2.2.3.exe', 'exe');
    writeFileSync(join(out, 'x-2.2.3.exe.blockmap'), 'map');
    expect(run().status).toBe(0);
    expect(readFileSync(join(feed, '2.2.3/x-2.2.3.exe.blockmap'), 'utf8')).toBe('map');
  });

  it('creates the feed folder when missing', () => {
    makeRelease('latest-linux.yml', 'x-2.2.3.deb', 'd');
    expect(existsSync(feed)).toBe(false);
    expect(run().status).toBe(0);
    expect(existsSync(feed)).toBe(true);
  });
});
