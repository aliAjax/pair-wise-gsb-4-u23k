/* License Lens · 数据层
 * 许可证知识库、渠道/用途字典、示例批次、状态与持久化。
 * 只做数据存取：门禁判断在 rules.js，界面渲染在 ui.js。 */
window.LL = window.LL || {};

LL.DATA = (() => {
  /* ---------- 字典 ---------- */
  const LICENSES = {
    'MIT':          { risk: 'low',    family: 'permissive', note: '宽松许可证，保留声明即可分发' },
    'ISC':          { risk: 'low',    family: 'permissive', note: '宽松许可证，保留声明即可分发' },
    'Apache-2.0':   { risk: 'low',    family: 'permissive', note: '含专利授权与 NOTICE 要求' },
    'BSD-3-Clause': { risk: 'low',    family: 'permissive', note: '宽松许可证，保留声明即可分发' },
    'CC-BY-4.0':    { risk: 'medium', family: 'content',    note: '知识共享署名，非软件许可证，需确认使用场景' },
    'LGPL-3.0':     { risk: 'medium', family: 'gpl',        note: '弱 Copyleft，属 GPL 系，进入闭源渠道会被门禁阻断' },
    'GPL-2.0':      { risk: 'high',   family: 'gpl',        note: '强 Copyleft，衍生作品须以 GPL 发布' },
    'GPL-3.0':      { risk: 'high',   family: 'gpl',        note: '强 Copyleft，衍生作品须以 GPL 发布' },
    'AGPL-3.0':     { risk: 'high',   family: 'gpl',        note: '网络使用亦触发开源义务' },
    'Proprietary':  { risk: 'medium', family: 'closed',     note: '专有许可，需确认授权范围' },
    'Unknown':      { risk: 'high',   family: 'unknown',    note: '未识别许可证，按高风险处理' },
  };
  const CHANNELS = [
    { id: 'npm',        name: 'npm 公共源',   closed: false },
    { id: 'mirror',     name: '内部镜像',     closed: false },
    { id: 'vendor',     name: '供应商交付',   closed: false },
    { id: 'commercial', name: '闭源商业分发', closed: true },
    { id: 'embedded',   name: '闭源固件集成', closed: true },
  ];
  const PURPOSES = [
    { id: 'runtime', name: '运行时依赖' },
    { id: 'dev',     name: '开发依赖' },
    { id: 'build',   name: '构建工具' },
    { id: 'test',    name: '测试工具' },
    { id: 'bundle',  name: '随产品分发' },
  ];
  const RISK_LABEL = { low: '低', medium: '中', high: '高' };

  const licenseInfo = lic => LICENSES[lic] || LICENSES.Unknown;
  const channelById = id => CHANNELS.find(c => c.id === id) || CHANNELS[0];
  const purposeById = id => PURPOSES.find(p => p.id === id) || PURPOSES[0];
  /* 来源摘要即组件身份：无摘要时退化为 名称@版本 */
  const keyOf = e => (e.digest && e.digest.trim()) ? e.digest.trim() : `${e.name}@${e.version}`;

  const pad = n => String(n).padStart(2, '0');
  const now = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  let uidSeq = 0;
  const uid = p => `${p}${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

  /* 条目：一批记录包名、版本、来源摘要、渠道、用途 + 证据与责任字段 */
  const entry = (name, version, license, digest, channel, purpose, extra = {}) => ({
    id: uid('e'), name, version, license, digest, channel, purpose,
    declared: false, verified: false, owner: '', deadline: '', ...extra,
  });

  /* ---------- 状态 ---------- */
  const STORAGE_KEY = 'license-lens-sbom-v1';
  let state = null;

  function makeBatch(kind, reason, baseId, entries, at) {
    const base = baseId ? state.batches.find(b => b.id === baseId) : null;
    return {
      id: `B-${String(state.nextSeq).padStart(3, '0')}`,
      kind,                       // initial 首次导入 | recheck 重检
      reason,                     // 批次原因（重检必填）
      baseId: base ? base.id : null,
      at: at || now(),
      entries,
      diff: LL.RULES.diff(base ? base.entries : [], entries),   // 相对基线批次的差异
      verdict: LL.RULES.evaluate(entries),                      // 门禁裁决
      frozen: false,                // 放行后冻结证据与裁决
      releasedAt: null,
    };
  }

  function addBatch(kind, reason, baseId, entries, at) {
    const b = makeBatch(kind, reason, baseId, entries, at);
    state.batches.push(b);
    state.nextSeq += 1;
    state.activeId = b.id;
    save();
    return b;
  }

  function seed() {
    state = { batches: [], activeId: null, nextSeq: 1 };
    const dv = { declared: true, verified: true };
    // B-001：合规基线，已放行并冻结
    const b1 = addBatch('initial', '首次导入：Q3 版本基线准入', null, [
      entry('react', '18.3.1', 'MIT', 'sha256:7c4a91d2', 'npm', 'runtime', dv),
      entry('lodash', '4.17.21', 'MIT', 'sha256:10da77be', 'npm', 'runtime', dv),
      entry('axios', '1.7.2', 'MIT', 'sha256:a109c4d8', 'mirror', 'runtime', dv),
      entry('zod', '3.23.8', 'MIT', 'sha256:3d3821f0', 'npm', 'runtime', dv),
      entry('typescript', '5.5.4', 'Apache-2.0', 'sha256:5c5549ce', 'npm', 'build', dv),
      entry('font-awesome', '6.5.2', 'CC-BY-4.0', 'sha256:fa652b31', 'vendor', 'bundle', dv),
    ], '2026-09-01 10:20');
    b1.frozen = true;
    b1.releasedAt = '2026-09-01 16:40';
    // B-002：引入闭源渠道后的重检，含三类门禁违规；重复摘要与 B-001 合并
    addBatch('recheck', '新增桌面客户端闭源分发渠道，重检许可证兼容性', b1.id, [
      entry('react', '19.0.0', 'MIT', 'sha256:9e0b52cc', 'npm', 'runtime', dv),
      entry('lodash', '4.17.21', 'MIT', 'sha256:10da77be', 'npm', 'runtime', dv),
      entry('axios', '1.7.2', 'MIT', 'sha256:a109c4d8', 'mirror', 'runtime', { declared: true }),
      entry('sharp', '0.33.4', 'Apache-2.0', 'sha256:c033e54a', 'commercial', 'bundle', { declared: true }),
      entry('legacy-gpl', '2.4.0', 'GPL-3.0', 'sha256:24f0a9c1', 'commercial', 'bundle', dv),
      entry('unknown-lib', '0.9.1', 'Unknown', '', 'vendor', 'runtime'),
      entry('zod', '3.23.8', 'MIT', 'sha256:3d3821f0', 'npm', 'runtime', dv),
      entry('typescript', '5.5.4', 'Apache-2.0', 'sha256:5c5549ce', 'npm', 'build', dv),
    ], '2026-09-12 09:30');
    return state;
  }

  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { state = JSON.parse(raw); return state; }
    } catch {}
    return reset();
  }
  function reset() { state = seed(); save(); return state; }

  const getState = () => state;
  const batchById = id => state.batches.find(b => b.id === id);

  /* 刷新：以当前条目重算差异与门禁，保证批次、变化、门禁三者一致 */
  function refresh(batchId) {
    const b = batchById(batchId);
    if (!b || b.frozen) return b;
    const base = b.baseId ? batchById(b.baseId) : null;
    b.diff = LL.RULES.diff(base ? base.entries : [], b.entries);
    b.verdict = LL.RULES.evaluate(b.entries);
    save();
    return b;
  }

  /* 以下变更仅允许作用于未冻结批次，且每次变更后立即刷新保持一致 */
  function updateEntry(batchId, entryId, patch) {
    const b = batchById(batchId);
    if (!b || b.frozen) return;
    const e = b.entries.find(x => x.id === entryId);
    if (!e) return;
    Object.assign(e, patch);
    refresh(batchId);
  }
  function addEntry(batchId, e) {
    const b = batchById(batchId);
    if (!b || b.frozen) return;
    b.entries.push(e);
    refresh(batchId);
  }
  function removeEntry(batchId, entryId) {
    const b = batchById(batchId);
    if (!b || b.frozen) return;
    b.entries = b.entries.filter(x => x.id !== entryId);
    refresh(batchId);
  }

  /* 放行：仅门禁通过时生效，随后冻结证据与裁决 */
  function release(batchId) {
    const b = batchById(batchId);
    if (!b || b.frozen) return false;
    refresh(batchId);
    if (b.verdict.status !== 'passed') return false;
    b.frozen = true;
    b.releasedAt = now();
    save();
    return true;
  }

  function setActive(id) { if (batchById(id)) { state.activeId = id; save(); } }

  /* 组件台帐：相同来源摘要只保留一条，批次关联合并 */
  function ledger() {
    const map = new Map();
    for (const b of state.batches) {
      for (const e of b.entries) {
        const k = keyOf(e);
        if (!map.has(k)) map.set(k, { key: k, channels: [], batches: [] });
        const c = map.get(k);
        Object.assign(c, { name: e.name, version: e.version, license: e.license, digest: e.digest }); // 以最新批次为准
        if (!c.batches.includes(b.id)) c.batches.push(b.id);
        if (!c.channels.includes(e.channel)) c.channels.push(e.channel);
      }
    }
    return [...map.values()];
  }

  /* 解析导入文本：名称@版本 许可证 摘要 渠道 用途（后三项可省）。
   * 重复摘要只合并：同批去重；命中基线摘要时继承其证据字段。 */
  function parseLines(text, baseEntries = []) {
    const baseByKey = new Map(baseEntries.map(e => [keyOf(e), e]));
    const merged = new Map();
    let dupCount = 0;
    for (const raw of String(text).split(/\n+/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const tokens = line.split(/[\s,，]+/).filter(Boolean);
      if (!tokens.length) continue;
      let name = tokens[0], version = '—';
      const at = name.lastIndexOf('@');
      if (at > 0) { version = name.slice(at + 1); name = name.slice(0, at); }
      const rest = tokens.slice(1);
      let license = 'Unknown', digest = '', channel = 'npm', purpose = 'runtime';
      if (rest.length && !CHANNELS.some(c => c.id === rest[0]) && !PURPOSES.some(p => p.id === rest[0])) {
        license = rest.shift() || 'Unknown';
      }
      for (const t of rest) {
        if (CHANNELS.some(c => c.id === t)) channel = t;
        else if (PURPOSES.some(p => p.id === t)) purpose = t;
        else if (!digest) digest = t;
      }
      const e = entry(name, version, license, digest, channel, purpose);
      const k = keyOf(e);
      const base = baseByKey.get(k);
      if (base) { e.declared = base.declared; e.verified = base.verified; e.owner = base.owner; e.deadline = base.deadline; }
      if (merged.has(k)) { dupCount += 1; continue; }
      merged.set(k, e);
    }
    return { entries: [...merged.values()], dupCount };
  }

  const serialize = entries => entries
    .map(e => `${e.name}@${e.version} ${e.license} ${e.digest || ''} ${e.channel} ${e.purpose}`.replace(/\s+/g, ' ').trim())
    .join('\n');

  return {
    LICENSES, CHANNELS, PURPOSES, RISK_LABEL,
    licenseInfo, channelById, purposeById, keyOf, now, entry,
    load, reset, getState, batchById,
    refresh, updateEntry, addEntry, removeEntry, addBatch, release, setActive,
    ledger, parseLines, serialize,
  };
})();
