import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { guardWrite } from '../../../core/harness/PolicyGuard';
import { reviewDiff } from '../../../core/harness/AgentReview';
import { decide } from '../../../core/reception/Decider';
import { CheckpointManager } from '../../../core/harness/CheckpointManager';

describe('PolicyGuard — token files vs token source', () => {
  it.each(['src/auth/tokenService.ts', 'src/auth/TokenProvider.java', 'tokenizer/index.ts'])(
    'does not deny legitimate source %s', p => expect(guardWrite(p).verdict).not.toBe('deny'));
  it.each(['.env', '.env.local', 'config/id_rsa', 'certs/server.pem', 'secrets/db.txt', 'token.json', 'config/.token', 'auth/access_token'])(
    'still denies secret file %s', p => expect(guardWrite(p).verdict).toBe('deny'));
});

describe('AgentReview — secrets', () => {
  const sources = ['src'];
  it('does not block ordinary auth code that mentions token/password', () => {
    const code = 'export function verify(token: string) { return jwt.verify(token, process.env.JWT_KEY); }\nfunction checkPassword(password: string) {}\n';
    expect(reviewDiff('src/auth.ts', '', code, sources).pass).toBe(true);
  });
  it.each([
    "const apiKey = 'sk-abc123abc123abc123abc';",
    'password: "SuperSecret12345"',
    '-----BEGIN RSA PRIVATE KEY-----',
    'const k = "AKIAABCDEFGHIJKLMNOP";',
  ])('still blocks literal secret: %s', line => expect(reviewDiff('src/a.ts', '', line + '\n', sources).pass).toBe(false));
});

describe('Decider — word boundaries', () => {
  it('does not route "laws" or "cardiac" to the ops specialist', () => {
    expect(decide('explain the laws of thermodynamics', null).route).not.toBe('specialist');
    expect(decide('cardiac arrest article', null).route).not.toBe('specialist');
  });
  it('still routes real ops requests', () => {
    expect(decide('deploy to aws with terraform', null).route).toBe('specialist');
    expect(decide('escribe el Dockerfile', null).route).toBe('specialist');
  });
});

// These tests run real `git stash push` + `apply` (several processes). On a loaded Windows machine that took more than
// Jest's default 5 s and failed intermittently; CheckpointManager itself allows 15 s per git command.
const GIT_TEST_TIMEOUT_MS = 30000;

describe('CheckpointManager — must not remove the developer\'s work', () => {
  let dir: string;
  const git = (c: string) => execSync(`git ${c}`, { cwd: dir, stdio: 'pipe' }).toString();
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-cp-'));
    git('init -q'); git('config user.email t@t.t'); git('config user.name t');
    // On Windows a global core.autocrlf=true rewrites LF as CRLF on stash apply and breaks the byte comparison below.
    git('config core.autocrlf false');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'v1\n'); git('add .'); git('commit -qm init');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps tracked edits and untracked files in place, and still records a stash', async () => {
    fs.appendFileSync(path.join(dir, 'a.txt'), 'uncommitted\n');
    fs.writeFileSync(path.join(dir, 'new.txt'), 'untracked\n');
    const res = await new CheckpointManager(dir).save('apply-diffs');
    expect(res.startsWith('stash:alpaquitay/apply-diffs')).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('v1\nuncommitted\n');
    expect(fs.existsSync(path.join(dir, 'new.txt'))).toBe(true);
    expect(git('stash list')).toContain('alpaquitay/apply-diffs');
  }, GIT_TEST_TIMEOUT_MS);
  it('does not claim a checkpoint (or reuse an old stash) on a clean tree', async () => {
    const res = await new CheckpointManager(dir).save('x');
    expect(res.startsWith('clean:')).toBe(true);
    expect(git('stash list').trim()).toBe('');
  }, GIT_TEST_TIMEOUT_MS);
});
