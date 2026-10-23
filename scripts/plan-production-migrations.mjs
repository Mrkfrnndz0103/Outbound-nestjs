import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateManifest } from './ci/validate-migration-manifest.mjs';

// Read-only: this tool never connects to a database or adopts migration history.
export function migrationPlan(root, history, target) {
  const entries = validateManifest(root);
  if (!target || history.target !== target || !history.reviewedBy || !history.schemaEvidence || !history.backupReference) throw new Error('Explicit matching target, reviewer, schemaEvidence and backupReference are required');
  if (!['fresh', 'upgrade'].includes(history.mode) || !Array.isArray(history.applied)) throw new Error('Expected mode fresh/upgrade and applied filename/hash records');
  if (history.mode === 'fresh' && history.applied.length) throw new Error('Fresh target cannot have applied migrations');
  const applied = new Set();
  for (const row of history.applied) {
    if (!entries.includes(row.file) || applied.has(row.file)) throw new Error(`Unknown or duplicate history: ${row.file}`);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(`${root}/supabase/migrations/${row.file}`)).digest('hex');
    if (hash !== row.sha256) throw new Error(`Changed migration: ${row.file}; reconcile with database owner`);
    applied.add(row.file);
  }
  // Reject gaps: mixed/unknown historical installations require DBA reconciliation.
  if (entries.slice(0, applied.size).some(x => !applied.has(x))) throw new Error('History is not an exact manifest prefix; reconcile actual schema/history before proceeding');
  const split = entries.indexOf('20261013060000_workflow_outbox.sql');
  return { target, mode: history.mode, phaseA: entries.slice(0, split + 1).filter(x => !applied.has(x)), phaseB: 'Review artisan migrate:status then php artisan migrate --force on the SAME target; never rerun recorded Laravel migrations', phaseC: entries.slice(split + 1).filter(x => !applied.has(x)) };
}
if (process.argv[1]?.endsWith('plan-production-migrations.mjs')) {
  try {
    const [, , historyPath, target] = process.argv;
    console.log(JSON.stringify(migrationPlan(process.cwd(), JSON.parse(fs.readFileSync(historyPath, 'utf8')), target), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

