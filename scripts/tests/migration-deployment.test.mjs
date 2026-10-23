import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateManifest } from '../ci/validate-migration-manifest.mjs';
import { migrationPlan } from '../plan-production-migrations.mjs';
const root = process.cwd();
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'supabase/migrations', file))).digest('hex');
const history = { target: 'dummy-local-only', reviewedBy: 'dummy DBA', schemaEvidence: 'synthetic fixture', backupReference: 'dummy backup', mode: 'fresh', applied: [] };
test('repository manifest covers all forward SQL exactly once', () => assert.ok(validateManifest(root).length >= 43));
test('missing, duplicate, unlisted forward and invalid entries fail', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'soc5-manifest-'));
  try {
    fs.mkdirSync(path.join(temp, 'supabase/migrations'), { recursive: true });
    fs.mkdirSync(path.join(temp, 'docs/deployment'), { recursive: true });
    const boundary = '20261013060000_workflow_outbox.sql';
    for (const file of [boundary, 'forward.sql']) fs.writeFileSync(path.join(temp, 'supabase/migrations', file), '-- dummy');
    for (const text of [boundary, `${boundary}\nforward.sql\nforward.sql`, `${boundary}\nforward.sql\n../bad.sql`]) {
      fs.writeFileSync(path.join(temp, 'docs/deployment/supabase-migration-manifest.txt'), text);
      assert.throws(() => validateManifest(temp));
    }
    fs.writeFileSync(path.join(temp, 'docs/deployment/supabase-migration-manifest.txt'), `${boundary}\nforward.sql`);
    assert.equal(validateManifest(temp).length, 2);
  } finally { fs.rmSync(temp, { recursive: true }); }
});
test('fresh and reviewed upgrade plans preserve A / Laravel / C order', () => {
  const entries = validateManifest(root);
  const fresh = migrationPlan(root, history, history.target);
  assert.equal(fresh.phaseA.at(-1), '20261013060000_workflow_outbox.sql');
  assert.equal(fresh.phaseC[0], '20261014133548_reconcile_production_schema.sql');
  const prefix = entries.slice(0, fresh.phaseA.length);
  const upgrade = migrationPlan(root, { ...history, mode: 'upgrade', applied: prefix.map(file => ({ file, sha256: hash(file) })) }, history.target);
  assert.equal(upgrade.phaseA.length, 0);
  assert.deepEqual(upgrade.phaseC, fresh.phaseC);
});
test('unknown target, edited SQL, gaps and unreviewed histories refuse', () => {
  const entries = validateManifest(root);
  assert.throws(() => migrationPlan(root, history, 'other-target'));
  assert.throws(() => migrationPlan(root, { ...history, reviewedBy: '' }, history.target));
  assert.throws(() => migrationPlan(root, { ...history, mode: 'upgrade', applied: [{ file: entries[0], sha256: 'bad' }] }, history.target));
  assert.throws(() => migrationPlan(root, { ...history, mode: 'upgrade', applied: [{ file: entries[1], sha256: hash(entries[1]) }] }, history.target));
});
