import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function validateManifest(root = process.cwd()) {
  const directory = path.join(root, 'supabase/migrations');
  const entries = fs.readFileSync(path.join(root, 'docs/deployment/supabase-migration-manifest.txt'), 'utf8').split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  const actual = fs.readdirSync(directory).filter(x => x.endsWith('.sql'));
  const duplicates = entries.filter((x, i) => entries.indexOf(x) !== i);
  const missing = actual.filter(x => !entries.includes(x));
  const invalid = entries.filter(x => !/^[A-Za-z0-9_]+\.sql$/.test(x) || !actual.includes(x));
  if (duplicates.length || missing.length || invalid.length) throw new Error(JSON.stringify({ duplicates, missing, invalid }));
  if (entries.filter(x => x === '20261013060000_workflow_outbox.sql').length !== 1) throw new Error('Missing phase A boundary');
  return entries;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Validated ${validateManifest(process.argv[2]).length} migrations with exact coverage.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
