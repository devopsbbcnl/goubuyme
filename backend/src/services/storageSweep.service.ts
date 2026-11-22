/**
 * Nightly clean-up of uploaded files in R2.
 *
 * Signed upload links cannot cap file size, and someone can upload a photo and never save the form. This sweep removes:
 *   - files larger than UPLOAD_MAX_BYTES (older than 1 hour, so a file being saved right now is never caught), and
 *   - unused files: nothing in the database refers to them and they are older than 48 hours.
 *
 * Safety rules, because this deletes things:
 *   - DRY RUN unless STORAGE_SWEEP_DELETE=true. A dry run only reports what it would delete.
 *   - Only touches the folders the apps write to. `migrated/`, `kyc/legacy/`, `hr/legacy/` and any unknown folder are never touched.
 *   - Refuses to delete anything if the database scan finds no references while the bucket has files (a broken scan
 *     must never look like "everything is unused").
 *   - Deletes at most SWEEP_MAX_DELETES (default 500) per run.
 */
import prisma from '../config/db';
import {
  PURPOSES, listObjects, deleteObject, isConfigured, publicBase, maxUploadBytes, type BucketKind, type StoredObject,
} from './objectStorage.service';

const HOUR = 60 * 60 * 1000;
const PROTECTED_PREFIXES = ['migrated/', 'kyc/legacy/', 'hr/legacy/'];

export type Verdict = 'keep' | 'oversize' | 'orphan' | 'protected';

export interface SweepRules { now: Date; maxBytes: number; orphanAgeHours: number }

const knownFolders = (kind: BucketKind): string[] =>
  Object.values(PURPOSES).filter((p) => p.bucket === kind).map((p) => `${p.folder}/`);

/** Pure decision for one stored file. */
export function judgeObject(kind: BucketKind, obj: StoredObject, referenced: Set<string>, rules: SweepRules): Verdict {
  if (PROTECTED_PREFIXES.some((p) => obj.key.startsWith(p))) return 'protected';
  if (!knownFolders(kind).some((p) => obj.key.startsWith(p))) return 'protected';
  const ageMs = rules.now.getTime() - obj.lastModified.getTime();
  if (obj.size > rules.maxBytes && ageMs >= HOUR) return 'oversize';
  if (!referenced.has(obj.key) && ageMs >= rules.orphanAgeHours * HOUR) return 'orphan';
  return 'keep';
}

/** Pure: every R2 file key mentioned in a piece of text (public addresses and private references). */
export function extractReferencedKeys(text: string, base: string): string[] {
  const keys: string[] = [];
  for (const m of text.matchAll(/r2-kyc:(kyc\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.[a-z0-9]{2,5})/g)) keys.push(m[1]);
  for (const m of text.matchAll(/r2-hr:(hr\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.[a-z0-9]{2,5})/g)) keys.push(m[1]);
  if (base) {
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of text.matchAll(new RegExp(`${escaped}/([^\\s"'<>)\\\\?#]+)`, 'g'))) {
      try { keys.push(decodeURIComponent(m[1])); } catch { keys.push(m[1]); }
    }
  }
  return keys;
}

/** Collects every referenced file key from every text and JSON column that has an `id`. */
export async function collectReferencedKeys(): Promise<Set<string>> {
  const base = publicBase();
  const referenced = new Set<string>();
  const cols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(
    `SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.data_type IN ('text','character varying','json','jsonb') AND c.table_name <> '_prisma_migrations'`,
  );
  const patterns = ['%r2-kyc:%', '%r2-hr:%', ...(base ? [`%${base}/%`] : [])];
  for (const c of cols) {
    const expr = ['json', 'jsonb'].includes(c.data_type) ? `"${c.column_name}"::text` : `"${c.column_name}"`;
    const where = patterns.map((_, i) => `${expr} LIKE $${i + 1}`).join(' OR ');
    const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(`SELECT ${expr} AS v FROM "${c.table_name}" WHERE ${where}`, ...patterns).catch(() => []);
    for (const r of rows) for (const k of extractReferencedKeys(String(r.v), base)) referenced.add(k);
  }
  return referenced;
}

export interface SweepResult {
  dryRun: boolean;
  scanned: number;
  oversize: number;
  orphans: number;
  deleted: number;
  aborted?: string;
  examples: string[];
}

export async function runStorageSweep(opts: { now?: Date; deleteEnabled?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<SweepResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const deleteEnabled = opts.deleteEnabled ?? env.STORAGE_SWEEP_DELETE === 'true';
  const maxDeletes = parseInt(env.SWEEP_MAX_DELETES ?? '', 10) || 500;
  const rules: SweepRules = { now, maxBytes: maxUploadBytes(env), orphanAgeHours: 48 };
  const result: SweepResult = { dryRun: !deleteEnabled, scanned: 0, oversize: 0, orphans: 0, deleted: 0, examples: [] };

  const kinds = (['kyc', 'media'] as BucketKind[]).filter((k) => isConfigured(k, env));
  if (kinds.length === 0) { result.aborted = 'storage is not configured'; return result; }

  const referenced = await collectReferencedKeys();
  const toDelete: { kind: BucketKind; key: string; why: Verdict }[] = [];

  for (const kind of kinds) {
    for await (const obj of listObjects(kind)) {
      result.scanned++;
      const v = judgeObject(kind, obj, referenced, rules);
      if (v === 'oversize') { result.oversize++; toDelete.push({ kind, key: obj.key, why: v }); }
      else if (v === 'orphan') { result.orphans++; toDelete.push({ kind, key: obj.key, why: v }); }
    }
  }

  // A scan that found no references at all while files exist is far more likely a fault than "everything is unused".
  if (result.scanned > 20 && referenced.size === 0 && toDelete.some((d) => d.why === 'orphan')) {
    result.aborted = 'no references found in the database, refusing to delete unused files';
    result.orphans = 0;
    for (let i = toDelete.length - 1; i >= 0; i--) if (toDelete[i].why === 'orphan') toDelete.splice(i, 1);
  }

  result.examples = toDelete.slice(0, 10).map((d) => `${d.why}: ${d.kind}/${d.key}`);
  if (deleteEnabled) {
    for (const d of toDelete.slice(0, maxDeletes)) {
      try { await deleteObject(d.kind, d.key); result.deleted++; } catch { /* leave it for tomorrow */ }
    }
  }
  return result;
}
