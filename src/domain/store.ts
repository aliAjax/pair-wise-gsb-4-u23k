// 批次存储层：证据合并、批次差异、放行冻结、持久化。不依赖界面。
import { evaluateBatch } from './rules';
import { licenseInfoOf, normalizeLicense } from '../data/licenses';
import { CHANNELS, USAGES } from './types';
import type {
  Batch,
  BatchEntry,
  BatchStatus,
  ChangeItem,
  Channel,
  DraftEntry,
  Evidence,
  FrozenEntry,
  Store,
  Usage,
  Violation,
} from './types';

const STORAGE_KEY = 'license-lens-store-v1';

function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** 证据去重键：包名 + 版本 + 来源摘要 */
export function evidenceIdOf(name: string, version: string, summary: string): string {
  return `ev-${hash(`${name.trim()}@${version.trim()}|${summary.trim()}`)}`;
}

export function now(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 解析批次条目：已放行批次读冻结快照，其余批次实时关联证据库 */
export function resolveEntries(store: Store, batch: Batch): FrozenEntry[] {
  if (batch.snapshot) return batch.snapshot;
  const byId = new Map(store.evidence.map(e => [e.id, e]));
  return batch.entries.flatMap(en => {
    const ev = byId.get(en.evidenceId);
    if (!ev) return [];
    const { batchIds: _batchIds, id: _id, ...fields } = ev;
    return [{ ...en, ...fields }];
  });
}

/** 计算两批条目差异（按包名对齐，版本变化记为变更） */
export function diffEntries(prev: FrozenEntry[], next: FrozenEntry[]): ChangeItem[] {
  const changes: ChangeItem[] = [];
  const prevByName = new Map(prev.map(e => [e.name, e]));
  const nextByName = new Map(next.map(e => [e.name, e]));
  const textFields: [keyof FrozenEntry, string][] = [
    ['version', '版本'],
    ['license', '许可证'],
    ['summary', '来源摘要'],
    ['channel', '渠道'],
    ['usage', '用途'],
    ['owner', '责任人'],
    ['deadline', '期限'],
  ];
  for (const n of next) {
    const p = prevByName.get(n.name);
    if (!p) {
      changes.push({ kind: 'added', pkg: `${n.name}@${n.version}`, detail: `新增组件 · ${n.license} · ${n.channel}` });
      continue;
    }
    const diffs = textFields
      .filter(([k]) => String(p[k]) !== String(n[k]))
      .map(([k, label]) => `${label} ${String(p[k]) || '—'} → ${String(n[k]) || '—'}`);
    if (p.declaredInPackage !== n.declaredInPackage)
      diffs.push(`包内声明 ${p.declaredInPackage ? '有' : '无'} → ${n.declaredInPackage ? '有' : '无'}`);
    if (p.manualVerified !== n.manualVerified)
      diffs.push(`人工核验 ${p.manualVerified ? '已核验' : '未核验'} → ${n.manualVerified ? '已核验' : '未核验'}`);
    if (diffs.length) changes.push({ kind: 'changed', pkg: `${n.name}@${n.version}`, detail: diffs.join('；') });
  }
  for (const p of prev) {
    if (!nextByName.has(p.name)) changes.push({ kind: 'removed', pkg: `${p.name}@${p.version}`, detail: `已移除 · ${p.license}` });
  }
  return changes;
}

/** 重算未冻结批次的门禁结果与差异，保持批次 / 变化 / 门禁一致 */
export function refreshBatch(store: Store, batch: Batch): Batch {
  if (batch.snapshot) return batch; // 已冻结：证据与裁决不再变化
  const resolved = resolveEntries(store, batch);
  const violations: Violation[] = evaluateBatch(resolved);
  const source = batch.sourceBatchId ? store.batches.find(b => b.id === batch.sourceBatchId) : null;
  const changes = source
    ? diffEntries(resolveEntries(store, source), resolved)
    : resolved.map(r => ({ kind: 'added' as const, pkg: `${r.name}@${r.version}`, detail: `新增组件 · ${r.license} · ${r.channel}` }));
  const status: BatchStatus = violations.length ? 'blocked' : 'pending';
  return { ...batch, violations, changes, status };
}

/** 新建批次：重复摘要只合并批次，不新建证据 */
export function createBatch(
  store: Store,
  drafts: DraftEntry[],
  reason: string,
  sourceBatchId: string | null,
  at?: string,
): Store {
  const id = `b-${store.nextSeq}-${hash(reason + (at ?? now()))}`;
  const evidence: Evidence[] = store.evidence.map(e => ({ ...e, batchIds: [...e.batchIds] }));
  const entries: BatchEntry[] = [];
  for (const d of drafts) {
    const license = normalizeLicense(d.license);
    const summary = d.summary.trim() || `清单声明 ${license}`;
    const eid = evidenceIdOf(d.name, d.version, summary);
    const existing = evidence.find(e => e.id === eid);
    if (existing) {
      if (!existing.batchIds.includes(id)) existing.batchIds.push(id);
    } else {
      evidence.push({
        id: eid,
        name: d.name.trim(),
        version: d.version.trim(),
        license,
        summary,
        declaredInPackage: d.declaredInPackage,
        manualVerified: d.manualVerified,
        batchIds: [id],
      });
    }
    entries.push({ evidenceId: eid, channel: d.channel, usage: d.usage, owner: d.owner, deadline: d.deadline });
  }
  const batch: Batch = {
    id,
    seq: store.nextSeq,
    createdAt: at ?? now(),
    reason,
    sourceBatchId,
    status: 'pending',
    entries,
    violations: [],
    changes: [],
    verdict: null,
    snapshot: null,
  };
  const next: Store = { ...store, evidence, batches: [...store.batches, batch], nextSeq: store.nextSeq + 1 };
  return { ...next, batches: next.batches.map(b => (b.id === id ? refreshBatch(next, b) : b)) };
}

/** 放行：门禁通过才允许，放行后冻结证据快照与裁决 */
export function releaseBatch(store: Store, batchId: string, by: string, at?: string): Store {
  return {
    ...store,
    batches: store.batches.map(b => {
      if (b.id !== batchId || b.snapshot || b.violations.length > 0) return b;
      return {
        ...b,
        status: 'released' as const,
        verdict: { decision: 'released' as const, at: at ?? now(), by },
        snapshot: resolveEntries(store, b),
      };
    }),
  };
}

/** 重检：以来源批次为蓝本新建带原因的批次，旧批次保留可查 */
export function recheckBatch(store: Store, sourceBatchId: string, reason: string): Store {
  const source = store.batches.find(b => b.id === sourceBatchId);
  if (!source) return store;
  const drafts: DraftEntry[] = resolveEntries(store, source).map(r => ({
    name: r.name,
    version: r.version,
    license: r.license,
    summary: r.summary,
    declaredInPackage: r.declaredInPackage,
    manualVerified: r.manualVerified,
    channel: r.channel,
    usage: r.usage,
    owner: r.owner,
    deadline: r.deadline,
  }));
  return createBatch(store, drafts, reason, sourceBatchId);
}

function isFrozen(store: Store, batchId: string): boolean {
  return store.batches.find(b => b.id === batchId)?.snapshot != null;
}

function refreshOne(store: Store, batchId: string): Store {
  return { ...store, batches: store.batches.map(b => (b.id === batchId ? refreshBatch(store, b) : b)) };
}

/** 修改批次内条目的渠道 / 用途 / 责任人 / 期限（未冻结批次） */
export function updateEntry(store: Store, batchId: string, evidenceId: string, patch: Partial<BatchEntry>): Store {
  if (isFrozen(store, batchId)) return store;
  const next: Store = {
    ...store,
    batches: store.batches.map(b =>
      b.id === batchId ? { ...b, entries: b.entries.map(e => (e.evidenceId === evidenceId ? { ...e, ...patch } : e)) } : b,
    ),
  };
  return refreshOne(next, batchId);
}

/** 更新证据（许可证识别、人工核验、包内声明），并重算引用它的未冻结批次 */
export function updateEvidence(
  store: Store,
  evidenceId: string,
  patch: Partial<Pick<Evidence, 'license' | 'manualVerified' | 'declaredInPackage'>>,
): Store {
  const next: Store = {
    ...store,
    evidence: store.evidence.map(e =>
      e.id === evidenceId ? { ...e, ...patch, license: patch.license ? normalizeLicense(patch.license) : e.license } : e,
    ),
  };
  return {
    ...next,
    batches: next.batches.map(b =>
      !b.snapshot && b.entries.some(en => en.evidenceId === evidenceId) ? refreshBatch(next, b) : b,
    ),
  };
}

/** 从未冻结批次移除条目 */
export function removeEntry(store: Store, batchId: string, evidenceId: string): Store {
  if (isFrozen(store, batchId)) return store;
  const next: Store = {
    ...store,
    batches: store.batches.map(b =>
      b.id === batchId ? { ...b, entries: b.entries.filter(e => e.evidenceId !== evidenceId) } : b,
    ),
  };
  return refreshOne(next, batchId);
}

/** 向未冻结批次追加一个组件 */
export function addEntry(store: Store, batchId: string, draft: DraftEntry): Store {
  if (isFrozen(store, batchId)) return store;
  const license = normalizeLicense(draft.license);
  const summary = draft.summary.trim() || `清单声明 ${license}`;
  const eid = evidenceIdOf(draft.name, draft.version, summary);
  const evidence: Evidence[] = store.evidence.map(e => ({ ...e, batchIds: [...e.batchIds] }));
  const existing = evidence.find(e => e.id === eid);
  if (existing) {
    if (!existing.batchIds.includes(batchId)) existing.batchIds.push(batchId);
  } else {
    evidence.push({
      id: eid,
      name: draft.name.trim(),
      version: draft.version.trim(),
      license,
      summary,
      declaredInPackage: draft.declaredInPackage,
      manualVerified: draft.manualVerified,
      batchIds: [batchId],
    });
  }
  const next: Store = {
    ...store,
    evidence,
    batches: store.batches.map(b =>
      b.id === batchId
        ? { ...b, entries: [...b.entries, { evidenceId: eid, channel: draft.channel, usage: draft.usage, owner: draft.owner, deadline: draft.deadline }] }
        : b,
    ),
  };
  return refreshOne(next, batchId);
}

/** 解析导入文本：每行 `name@version 许可证 | 来源摘要 | 渠道 | 用途`，# 开头为注释 */
export function parseImport(text: string): DraftEntry[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(line => {
      const [head = '', summary = '', channel = '', usage = ''] = line.split('|').map(s => s.trim());
      const m = head.match(/^(\S+?)@([\w.-]+)(?:\s+(\S+))?/);
      const name = m ? m[1] : head.split(/\s+/)[0] || 'unknown';
      const version = m ? m[2] : '0.0.0';
      const license = normalizeLicense(m?.[3] ?? 'UNKNOWN');
      const known = licenseInfoOf(license);
      return {
        name,
        version,
        license,
        summary: summary || `导入清单声明 ${license}`,
        declaredInPackage: known.family !== 'unknown',
        manualVerified: false,
        channel: (CHANNELS as string[]).includes(channel) ? (channel as Channel) : '内部使用',
        usage: (USAGES as string[]).includes(usage) ? (usage as Usage) : '生产依赖',
        owner: '',
        deadline: '',
      };
    });
}

/** 加载持久化数据；非冻结批次按当前证据与规则重算，保证刷新后批次 / 变化 / 门禁一致 */
export function loadStore(seed: () => Store): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (s && Array.isArray(s.batches) && Array.isArray(s.evidence) && typeof s.nextSeq === 'number') {
        return { ...s, batches: s.batches.map(b => (b.snapshot ? b : refreshBatch(s, b))) };
      }
    }
  } catch {
    // 数据损坏时回退到种子数据
  }
  return seed();
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 存储不可用时静默失败，界面仍可使用内存状态
  }
}
