// 界面层：只负责渲染与交互，数据与规则分别来自 data/ 与 domain/。
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, Check, Download, FileText, FileWarning, Layers, Lock, Minus,
  Package, Plus, RotateCcw, Scale, Search, ShieldAlert, ShieldCheck, Trash2, Upload, UserCheck,
} from 'lucide-react';
import { RULES } from './domain/rules';
import { LICENSES, licenseInfoOf } from './data/licenses';
import { seedStore } from './data/seed';
import {
  addEntry, createBatch, loadStore, parseImport, recheckBatch, releaseBatch,
  removeEntry, resolveEntries, saveStore, updateEntry, updateEvidence,
} from './domain/store';
import { CHANNELS, USAGES } from './domain/types';
import type { Batch, Channel, DraftEntry, FrozenEntry, LicenseFamily, Risk, Store, Usage, Violation } from './domain/types';

const STATUS_META: Record<Batch['status'], { label: string; cls: string }> = {
  pending: { label: '待放行', cls: 'amber' },
  blocked: { label: '已拦截', cls: 'red' },
  released: { label: '已放行', cls: 'green' },
};
const RISK_META: Record<Risk, { label: string; cls: string }> = {
  low: { label: '低风险', cls: 'green' },
  medium: { label: '中风险', cls: 'amber' },
  high: { label: '高风险', cls: 'red' },
};
const FAMILY_LABEL: Record<LicenseFamily, string> = {
  permissive: '宽松型',
  'weak-copyleft': '弱 Copyleft',
  'strong-copyleft': '强 Copyleft',
  'network-copyleft': '网络 Copyleft',
  'public-domain': '公共领域',
  other: '其他',
  unknown: '未知',
};
const LICENSE_OPTIONS = Object.keys(LICENSES);
const IMPORT_SAMPLE = `# 每行一个组件：name@version 许可证 | 来源摘要 | 渠道 | 用途
left-pad@1.3.0 MIT | 包内 LICENSE 文件：MIT | 闭源分发 | 生产依赖
legacy-gpl@2.4.0 GPL-3.0 | 扫描命中包内 LICENSE：GPL-3.0 | 闭源分发 | 生产依赖`;

function download(filename: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportBatchMarkdown(batch: Batch, entries: FrozenEntry[], store: Store) {
  const src = batch.sourceBatchId ? store.batches.find(b => b.id === batch.sourceBatchId) : null;
  const kindLabel = { added: '新增', removed: '移除', changed: '变更' } as const;
  const lines = [
    `# 批次 #${batch.seq} 准入报告`,
    '',
    `- 状态：${STATUS_META[batch.status].label}`,
    `- 创建时间：${batch.createdAt}`,
    `- 批次原因：${batch.reason}`,
    src ? `- 来源批次：#${src.seq}` : '- 来源批次：无（首批）',
    batch.verdict ? `- 放行裁决：${batch.verdict.at} 由 ${batch.verdict.by} 放行（证据与裁决已冻结）` : '- 放行裁决：未放行',
    '',
    '## 组件清单',
    '',
    '| 组件 | 许可证 | 渠道 | 用途 | 包内声明 | 人工核验 | 责任人 | 期限 |',
    '|---|---|---|---|---|---|---|---|',
    ...entries.map(
      e =>
        `| ${e.name}@${e.version} | ${e.license} | ${e.channel} | ${e.usage} | ${e.declaredInPackage ? '有' : '无'} | ${e.manualVerified ? '已核验' : '未核验'} | ${e.owner || '—'} | ${e.deadline || '—'} |`,
    ),
  ];
  if (batch.violations.length) {
    lines.push('', '## 门禁违规（禁止放行）', '', ...batch.violations.map(v => `- **${v.ruleName}** · ${v.pkg}：${v.detail}`));
  }
  if (batch.changes.length) {
    lines.push('', '## 与来源批次差异', '', ...batch.changes.map(c => `- [${kindLabel[c.kind]}] ${c.pkg}：${c.detail}`));
  }
  download(`batch-${batch.seq}-report.md`, lines.join('\n'));
}

export default function App() {
  const [store, setStore] = useState<Store>(() => loadStore(seedStore));
  const [view, setView] = useState<'batches' | 'evidence' | 'rules'>('batches');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState(IMPORT_SAMPLE);
  const [recheckOf, setRecheckOf] = useState<string | null>(null);
  const [recheckReason, setRecheckReason] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<DraftEntry>({
    name: '', version: '1.0.0', license: 'MIT', summary: '', declaredInPackage: true,
    manualVerified: false, channel: '内部使用', usage: '生产依赖', owner: '', deadline: '',
  });

  useEffect(() => saveStore(store), [store]);

  const selected = store.batches.find(b => b.id === selectedId) ?? store.batches[store.batches.length - 1];
  const seqOf = (id: string) => store.batches.find(b => b.id === id)?.seq ?? '?';
  const released = store.batches.filter(b => b.status === 'released').length;
  const blocked = store.batches.filter(b => b.status === 'blocked').length;

  const filteredBatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...store.batches].sort((a, b) => b.seq - a.seq);
    if (!q) return sorted;
    return sorted.filter(
      b =>
        `#${b.seq}`.includes(q) ||
        b.reason.toLowerCase().includes(q) ||
        resolveEntries(store, b).some(e => e.name.toLowerCase().includes(q)),
    );
  }, [store, query]);

  const doImport = () => {
    const drafts = parseImport(importText);
    if (!drafts.length) return;
    const next = createBatch(store, drafts, '导入依赖清单', null);
    setStore(next);
    setSelectedId(next.batches[next.batches.length - 1].id);
    setShowImport(false);
    setView('batches');
  };

  const doRecheck = () => {
    if (!recheckOf || !recheckReason.trim()) return;
    const next = recheckBatch(store, recheckOf, recheckReason.trim());
    setStore(next);
    setSelectedId(next.batches[next.batches.length - 1].id);
    setRecheckOf(null);
  };

  const doAddEntry = () => {
    if (!selected || !draft.name.trim()) return;
    setStore(addEntry(store, selected.id, { ...draft, name: draft.name.trim() }));
    setShowAdd(false);
    setDraft({ ...draft, name: '', summary: '' });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Scale size={19} /></div>
          <div><strong>License Lens</strong><span>SBOM 准入门禁</span></div>
        </div>
        <div className="side-label">证据链</div>
        <nav>
          <button className={view === 'batches' ? 'side-link active' : 'side-link'} onClick={() => setView('batches')}>
            <Layers size={17} />批次看板 <b>{store.batches.length}</b>
          </button>
          <button className={view === 'evidence' ? 'side-link active' : 'side-link'} onClick={() => setView('evidence')}>
            <Package size={17} />证据库 <b>{store.evidence.length}</b>
          </button>
          <button className={view === 'rules' ? 'side-link active' : 'side-link'} onClick={() => setView('rules')}>
            <ShieldCheck size={17} />门禁规则 <b>{RULES.length}</b>
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="streak">
            <span>放行率</span>
            <strong>{store.batches.length ? Math.round((released / store.batches.length) * 100) : 0} <small>%</small></strong>
            <i>已放行 {released} / {store.batches.length} 批 · 拦截 {blocked}</i>
          </div>
          <button className="ghost reset" onClick={() => { setStore(seedStore()); setSelectedId(null); }}>重置示例数据</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">LICENSE LENS · SBOM ADMISSION GATE</p>
            <h1>依赖准入门禁</h1>
          </div>
          <div className="top-actions">
            {view === 'batches' && (
              <div className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索批次或组件" /></div>
            )}
            <button className="primary" onClick={() => setShowImport(true)}><Upload size={16} />导入批次</button>
          </div>
        </header>

        <section className="stats">
          <div><span>批次总数</span><strong>{store.batches.length}</strong><small>重检新建批次，旧批次保留可查</small></div>
          <div><span>已放行</span><strong className="c-green">{released}</strong><small>证据与裁决已冻结</small></div>
          <div><span>已拦截</span><strong className="c-red">{blocked}</strong><small>保留原批次并列出差异与规则</small></div>
          <div><span>证据条目</span><strong>{store.evidence.length}</strong><small>重复摘要只合并批次</small></div>
        </section>

        {view === 'batches' && (
          <div className="view-grid">
            <section className="batch-list">
              {filteredBatches.map(b => {
                const st = STATUS_META[b.status];
                const count = b.snapshot ? b.snapshot.length : b.entries.length;
                return (
                  <button key={b.id} className={selected?.id === b.id ? 'batch-item selected' : 'batch-item'} onClick={() => setSelectedId(b.id)}>
                    <div className="bi-top">
                      <span className="bi-seq">#{b.seq}</span>
                      <span className={`badge ${st.cls}`}>{b.snapshot && <Lock size={10} />}{st.label}</span>
                    </div>
                    <div className="bi-reason">{b.reason}</div>
                    <div className="bi-meta">
                      {count} 个组件 · {b.createdAt}
                      {b.sourceBatchId ? ` · 源自 #${seqOf(b.sourceBatchId)}` : ' · 首批'}
                      {b.violations.length > 0 && !b.snapshot ? ` · ${b.violations.length} 项违规` : ''}
                    </div>
                  </button>
                );
              })}
              {filteredBatches.length === 0 && <div className="empty">没有匹配的批次</div>}
            </section>

            {selected && (
              <BatchDetail
                store={store}
                batch={selected}
                onRelease={() => setStore(releaseBatch(store, selected.id, '本地审核员'))}
                onRecheck={() => { setRecheckOf(selected.id); setRecheckReason(`重检批次 #${selected.seq}：`); }}
                onAdd={() => setShowAdd(true)}
                onExport={() => exportBatchMarkdown(selected, resolveEntries(store, selected), store)}
                onUpdateEntry={(eid, patch) => setStore(updateEntry(store, selected.id, eid, patch))}
                onUpdateEvidence={(eid, patch) => setStore(updateEvidence(store, eid, patch))}
                onRemoveEntry={eid => setStore(removeEntry(store, selected.id, eid))}
              />
            )}
          </div>
        )}

        {view === 'evidence' && (
          <section className="panel">
            <div className="panel-head"><h3>证据库 · 重复摘要只合并批次</h3><span className="muted">同一「包名 + 版本 + 来源摘要」仅保留一条证据</span></div>
            <div className="table">
              <div className="t-row t-head ev-cols"><span>组件</span><span>许可证</span><span>来源摘要</span><span>声明 / 核验</span><span>合并批次</span></div>
              {[...store.evidence].sort((a, b) => a.name.localeCompare(b.name)).map(ev => {
                const info = licenseInfoOf(ev.license);
                return (
                  <div className="t-row ev-cols" key={ev.id}>
                    <span><strong>{ev.name}</strong> <i className="ver">@{ev.version}</i></span>
                    <span><i className={`risk-dot ${info.risk}`} /><code>{ev.license}</code></span>
                    <span className="muted">{ev.summary}</span>
                    <span className="flags">
                      {ev.declaredInPackage ? <FileText size={14} /> : <FileWarning size={14} />}
                      {ev.manualVerified ? <UserCheck size={14} className="ok" /> : <UserCheck size={14} className="off" />}
                    </span>
                    <span className="chips">{ev.batchIds.map(id => <em key={id}>#{seqOf(id)}</em>)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {view === 'rules' && (
          <div className="rules-wrap">
            <section className="rules-grid">
              {RULES.map(r => (
                <div className="rule-card" key={r.id}>
                  <div className="rule-icon"><ShieldAlert size={18} /></div>
                  <div>
                    <strong>{r.name}</strong>
                    <p>{r.description}</p>
                    <code>{r.id}</code>
                  </div>
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="panel-head"><h3>许可证知识库</h3><span className="muted">未收录的许可证按高风险处理</span></div>
              <div className="table">
                <div className="t-row t-head lic-cols"><span>许可证</span><span>家族</span><span>风险</span><span>GPL 系</span><span>说明</span></div>
                {Object.values(LICENSES).map(l => (
                  <div className="t-row lic-cols" key={l.id}>
                    <span><code>{l.id}</code></span>
                    <span>{FAMILY_LABEL[l.family]}</span>
                    <span><span className={`badge ${RISK_META[l.risk].cls}`}>{RISK_META[l.risk].label}</span></span>
                    <span>{l.gplFamily ? '是' : '—'}</span>
                    <span className="muted">{l.note}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {showImport && (
        <div className="modal-backdrop" onClick={() => setShowImport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2>导入依赖清单为新批次</h2><button className="icon-btn" onClick={() => setShowImport(false)}>×</button></div>
            <textarea className="import-area" value={importText} onChange={e => setImportText(e.target.value)} spellCheck={false} />
            <p className="hint">每行一个组件：<code>name@version 许可证 | 来源摘要 | 渠道 | 用途</code>。相同「包名 + 版本 + 来源摘要」会与既有证据合并批次。</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowImport(false)}>取消</button>
              <button className="primary" onClick={doImport}><Check size={15} />创建批次并评估门禁</button>
            </div>
          </div>
        </div>
      )}

      {recheckOf && (
        <div className="modal-backdrop" onClick={() => setRecheckOf(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2>重检批次 #{seqOf(recheckOf)}</h2><button className="icon-btn" onClick={() => setRecheckOf(null)}>×</button></div>
            <p className="hint">将以来源批次为蓝本新建批次，旧批次保留可查；放行中的批次保持冻结。</p>
            <label className="field-label">重检原因
              <input autoFocus className="text-input" value={recheckReason} onChange={e => setRecheckReason(e.target.value)} placeholder="例如：季度重检 / 升级依赖" />
            </label>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setRecheckOf(null)}>取消</button>
              <button className="primary" onClick={doRecheck} disabled={!recheckReason.trim()}><RotateCcw size={15} />新建重检批次</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && selected && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2>向批次 #{selected.seq} 添加组件</h2><button className="icon-btn" onClick={() => setShowAdd(false)}>×</button></div>
            <div className="form-grid">
              <label className="field-label">包名<input className="text-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="例如 lodash" /></label>
              <label className="field-label">版本<input className="text-input" value={draft.version} onChange={e => setDraft({ ...draft, version: e.target.value })} /></label>
              <label className="field-label">许可证
                <select className="text-input" value={draft.license} onChange={e => setDraft({ ...draft, license: e.target.value })}>
                  {LICENSE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="field-label">渠道
                <select className="text-input" value={draft.channel} onChange={e => setDraft({ ...draft, channel: e.target.value as Channel })}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field-label">用途
                <select className="text-input" value={draft.usage} onChange={e => setDraft({ ...draft, usage: e.target.value as Usage })}>
                  {USAGES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <label className="field-label span2">来源摘要<input className="text-input" value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} placeholder={`留空则记为「清单声明 ${draft.license}」`} /></label>
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowAdd(false)}>取消</button>
              <button className="primary" onClick={doAddEntry} disabled={!draft.name.trim()}><Plus size={15} />添加并评估</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BatchDetail(props: {
  store: Store;
  batch: Batch;
  onRelease: () => void;
  onRecheck: () => void;
  onAdd: () => void;
  onExport: () => void;
  onUpdateEntry: (evidenceId: string, patch: Partial<Pick<FrozenEntry, 'channel' | 'usage' | 'owner' | 'deadline'>>) => void;
  onUpdateEvidence: (evidenceId: string, patch: Partial<Pick<FrozenEntry, 'license' | 'manualVerified' | 'declaredInPackage'>>) => void;
  onRemoveEntry: (evidenceId: string) => void;
}) {
  const { store, batch } = props;
  const frozen = batch.snapshot != null;
  const entries = resolveEntries(store, batch);
  const st = STATUS_META[batch.status];
  const source = batch.sourceBatchId ? store.batches.find(b => b.id === batch.sourceBatchId) : null;
  const canRelease = !frozen && batch.violations.length === 0 && entries.length > 0;
  const kindMeta = {
    added: { icon: <Plus size={13} />, cls: 'green', label: '新增' },
    removed: { icon: <Minus size={13} />, cls: 'red', label: '移除' },
    changed: { icon: <ArrowRightLeft size={13} />, cls: 'amber', label: '变更' },
  } as const;

  return (
    <section className="detail">
      <div className="detail-head">
        <div>
          <div className="detail-title">
            批次 #{batch.seq}
            <span className={`badge ${st.cls}`}>{frozen && <Lock size={10} />}{st.label}</span>
          </div>
          <p className="detail-meta">
            创建于 {batch.createdAt}
            {source ? ` · 来源批次 #${source.seq}` : ' · 首批'}
            {' · '}{batch.reason}
          </p>
        </div>
        <div className="detail-actions">
          <button className="primary" disabled={!canRelease} onClick={props.onRelease} title={frozen ? '已放行批次已冻结' : batch.violations.length ? '存在门禁违规，禁止放行' : '门禁通过，可放行'}>
            <ShieldCheck size={15} />放行
          </button>
          <button className="secondary" onClick={props.onRecheck}><RotateCcw size={14} />重检</button>
          {!frozen && <button className="secondary" onClick={props.onAdd}><Plus size={14} />添加组件</button>}
          <button className="ghost" onClick={props.onExport}><Download size={14} />导出</button>
        </div>
      </div>

      {batch.verdict && (
        <div className="verdict"><Lock size={14} />已于 {batch.verdict.at} 由 {batch.verdict.by} 放行，证据与裁决已冻结；重检将新建批次，本批次保留可查。</div>
      )}

      <div className={batch.violations.length ? 'panel gate blocked' : 'panel gate passed'}>
        <div className="panel-head">
          <h3>{batch.violations.length ? <><ShieldAlert size={15} />门禁拦截 · {batch.violations.length} 项违规</> : <><ShieldCheck size={15} />门禁通过</>}</h3>
          <span className="muted">{batch.violations.length ? '禁止放行，保留原批次并列出差异与规则' : frozen ? '已按冻结证据放行' : '可放行，放行后证据与裁决冻结'}</span>
        </div>
        {batch.violations.map((v, i) => (
          <div className="violation" key={`${v.ruleId}-${v.pkg}-${i}`}>
            <AlertTriangle size={14} />
            <div>
              <div className="v-head"><span className="rule-tag">{v.ruleName}</span><strong>{v.pkg}</strong></div>
              <p>{v.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {source && (
        <div className="panel">
          <div className="panel-head"><h3>与批次 #{source.seq} 的差异</h3><span className="muted">{batch.changes.length ? `${batch.changes.length} 项变化` : '无差异'}</span></div>
          {batch.changes.length === 0 && <p className="muted line">与来源批次完全一致。</p>}
          {batch.changes.map((c, i) => {
            const k = kindMeta[c.kind];
            return (
              <div className="change" key={`${c.pkg}-${i}`}>
                <span className={`change-icon ${k.cls}`}>{k.icon}</span>
                <div><strong>{c.pkg}</strong><span className="change-kind">{k.label}</span><p>{c.detail}</p></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>组件清单 · {entries.length}</h3><span className="muted">{frozen ? '冻结快照，只读' : '可直接编辑，保存后自动重估门禁'}</span></div>
        {entries.map(e => (
          <EntryRow
            key={e.evidenceId}
            entry={e}
            frozen={frozen}
            violations={batch.violations.filter(v => v.pkg === `${e.name}@${e.version}`)}
            onUpdateEntry={patch => props.onUpdateEntry(e.evidenceId, patch)}
            onUpdateEvidence={patch => props.onUpdateEvidence(e.evidenceId, patch)}
            onRemove={() => props.onRemoveEntry(e.evidenceId)}
          />
        ))}
        {entries.length === 0 && <div className="empty">批次为空，请添加组件</div>}
      </div>
    </section>
  );
}

function EntryRow(props: {
  entry: FrozenEntry;
  frozen: boolean;
  violations: Violation[];
  onUpdateEntry: (patch: Partial<Pick<FrozenEntry, 'channel' | 'usage' | 'owner' | 'deadline'>>) => void;
  onUpdateEvidence: (patch: Partial<Pick<FrozenEntry, 'license' | 'manualVerified' | 'declaredInPackage'>>) => void;
  onRemove: () => void;
}) {
  const { entry: e, frozen } = props;
  const info = licenseInfoOf(e.license);
  const risk = RISK_META[info.risk];
  const licenseOptions = LICENSE_OPTIONS.includes(e.license) ? LICENSE_OPTIONS : [...LICENSE_OPTIONS, e.license];

  if (frozen) {
    return (
      <div className={props.violations.length ? 'entry violating' : 'entry'}>
        <div className="entry-main">
          <div className="entry-title">
            <strong>{e.name}</strong><span className="ver">@{e.version}</span>
            <span className={`badge ${risk.cls}`}>{risk.label}</span>
            {props.violations.map(v => <span key={v.ruleId} className="rule-tag">{v.ruleName}</span>)}
          </div>
          <div className="entry-summary">{e.summary}</div>
        </div>
        <div className="entry-frozen">
          <span><code>{e.license}</code></span>
          <span>{e.channel} · {e.usage}</span>
          <span className="flags">
            {e.declaredInPackage ? <FileText size={14} /> : <FileWarning size={14} />}
            {e.manualVerified ? <UserCheck size={14} className="ok" /> : <UserCheck size={14} className="off" />}
          </span>
          <span>{e.owner || '—'} · {e.deadline || '—'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={props.violations.length ? 'entry violating' : 'entry'}>
      <div className="entry-main">
        <div className="entry-title">
          <strong>{e.name}</strong><span className="ver">@{e.version}</span>
          <span className={`badge ${risk.cls}`}>{risk.label}</span>
          {props.violations.map(v => <span key={v.ruleId} className="rule-tag">{v.ruleName}</span>)}
        </div>
        <div className="entry-summary">{e.summary}</div>
      </div>
      <div className="entry-fields">
        <label>许可证
          <select value={e.license} onChange={ev => props.onUpdateEvidence({ license: ev.target.value })}>
            {licenseOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>渠道
          <select value={e.channel} onChange={ev => props.onUpdateEntry({ channel: ev.target.value as Channel })}>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>用途
          <select value={e.usage} onChange={ev => props.onUpdateEntry({ usage: ev.target.value as Usage })}>
            {USAGES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label>责任人<input value={e.owner} placeholder="未指定" onChange={ev => props.onUpdateEntry({ owner: ev.target.value })} /></label>
        <label>期限<input type="date" value={e.deadline} onChange={ev => props.onUpdateEntry({ deadline: ev.target.value })} /></label>
      </div>
      <div className="entry-flags">
        <button
          className={e.declaredInPackage ? 'flag on' : 'flag'}
          title="包内是否存在许可证声明"
          onClick={() => props.onUpdateEvidence({ declaredInPackage: !e.declaredInPackage })}
        >
          {e.declaredInPackage ? <FileText size={13} /> : <FileWarning size={13} />}{e.declaredInPackage ? '包内声明' : '无声明'}
        </button>
        <button
          className={e.manualVerified ? 'flag on' : 'flag'}
          title="人工核验"
          onClick={() => props.onUpdateEvidence({ manualVerified: !e.manualVerified })}
        >
          <UserCheck size={13} />{e.manualVerified ? '已核验' : '待核验'}
        </button>
        <button className="icon-btn" title="从批次移除" onClick={props.onRemove}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}
