/* License Lens · 规则层
 * 门禁规则与批次差异计算：纯函数，不读写存储、不触碰界面。 */
window.LL = window.LL || {};

LL.RULES = (() => {
  /* 三条门禁，任一触发即禁止放行 */
  const RULES = [
    { id: 'R1', name: '证据齐备',     desc: '每个条目须同时具备包内声明与人工核验记录，缺一即阻断放行。' },
    { id: 'R2', name: '高风险责任落实', desc: '高风险条目必须指定责任人与整改期限。' },
    { id: 'R3', name: 'GPL 系隔离闭源渠道', desc: 'GPL 系（GPL / AGPL / LGPL）组件不得进入闭源分发渠道。' },
  ];

  const FIELD_LABELS = {
    name: '包名', version: '版本', license: '许可证', digest: '来源摘要',
    channel: '渠道', purpose: '用途', declared: '包内声明', verified: '人工核验',
    owner: '责任人', deadline: '整改期限',
  };

  /* 门禁评估：返回 { status, count, rules:[{...rule, violations:[{entry, detail}]}], at } */
  function evaluate(entries) {
    const D = LL.DATA;
    const rules = RULES.map(r => ({ ...r, violations: [] }));
    for (const e of entries) {
      const ref = { id: e.id, name: e.name, version: e.version };
      // R1 缺包内声明或人工核验 → 阻断
      const missEvidence = [];
      if (!e.declared) missEvidence.push('缺包内声明');
      if (!e.verified) missEvidence.push('缺人工核验');
      if (missEvidence.length) rules[0].violations.push({ entry: ref, detail: missEvidence.join('、') });
      // R2 高风险未定责任人与期限 → 阻断
      if (D.licenseInfo(e.license).risk === 'high') {
        const missDuty = [];
        if (!String(e.owner).trim()) missDuty.push('未定责任人');
        if (!e.deadline) missDuty.push('未定整改期限');
        if (missDuty.length) rules[1].violations.push({ entry: ref, detail: missDuty.join('、') });
      }
      // R3 GPL 系用于闭源渠道 → 阻断
      const ch = D.channelById(e.channel);
      if (D.licenseInfo(e.license).family === 'gpl' && ch.closed) {
        rules[2].violations.push({ entry: ref, detail: `${e.license} 进入闭源渠道「${ch.name}」` });
      }
    }
    const count = rules.reduce((n, r) => n + r.violations.length, 0);
    return { status: count === 0 ? 'passed' : 'blocked', count, rules, at: D.now() };
  }

  /* 批次差异：以来源摘要为键，比较基线与当前批次 */
  function diff(baseEntries, nextEntries) {
    const D = LL.DATA;
    const baseMap = new Map(baseEntries.map(e => [D.keyOf(e), e]));
    const nextMap = new Map(nextEntries.map(e => [D.keyOf(e), e]));
    const added = [], removed = [], changed = [];
    for (const [k, e] of nextMap) {
      const b = baseMap.get(k);
      if (!b) { added.push(e); continue; }
      const fields = [];
      for (const f of ['name', 'version', 'license', 'channel', 'purpose', 'declared', 'verified', 'owner', 'deadline']) {
        if (String(b[f]) !== String(e[f])) fields.push({ field: f, label: FIELD_LABELS[f], from: b[f], to: e[f] });
      }
      if (fields.length) changed.push({ key: k, name: e.name, version: e.version, fields });
    }
    for (const [k, e] of baseMap) if (!nextMap.has(k)) removed.push(e);
    return { added, removed, changed };
  }

  return { RULES, FIELD_LABELS, evaluate, diff };
})();
