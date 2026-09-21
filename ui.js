/* License Lens · 界面层
 * 只负责渲染与交互：数据读写经 LL.DATA，门禁与差异经 LL.RULES。 */
(() => {
  const D = LL.DATA;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  D.load();
  let baseForNew = null; // 「新建批次 / 重检」表单当前选定的基线批次

  const S = () => D.getState();
  const active = () => D.batchById(S().activeId) || S().batches[S().batches.length - 1];
  const yn = v => (v ? '有' : '无');
  const shortDigest = dg => (!dg ? '—' : dg.length > 16 ? dg.slice(0, 16) + '…' : dg);

  function fmtVal(field, val) {
    if (field === 'declared' || field === 'verified') return (val === true || val === 'true') ? '有' : '无';
    if (field === 'channel') return D.channelById(val).name;
    if (field === 'purpose') return D.purposeById(val).name;
    return val === '' || val == null ? '—' : String(val);
  }
  function licenseOptions(current) {
    const keys = Object.keys(D.LICENSES);
    const list = keys.includes(current) ? keys : [current, ...keys];
    return list.map(k => `<option value="${esc(k)}" ${k === current ? 'selected' : ''}>${esc(k)}</option>`).join('');
  }
  const status = msg => { $('#status').textContent = msg; };

  /* ---------- 指标 ---------- */
  function renderMetrics() {
    const b = active();
    const v = b.verdict;
    const released = S().batches.filter(x => x.frozen).length;
    $('#metrics').innerHTML = `
      <div class="metric"><small>当前批次</small><b>${esc(b.id)}</b><span class="sub">${b.entries.length} 个条目 · ${b.kind === 'initial' ? '首次导入' : '重检'}</span></div>
      <div class="metric"><small>门禁状态</small><b class="${v.status === 'passed' ? 'good' : 'bad'}">${v.status === 'passed' ? '通过' : '阻断'}</b><span class="sub">评估于 ${esc(v.at)}</span></div>
      <div class="metric"><small>未决违规</small><b class="${v.count ? 'warn' : 'good'}">${v.count}</b><span class="sub">${v.rules.filter(r => r.violations.length).length} 条规则被触发</span></div>
      <div class="metric"><small>已放行批次</small><b>${released}</b><span class="sub">证据与裁决已冻结</span></div>`;
  }

  /* ---------- 批次时间线（旧批次可查） ---------- */
  function renderTimeline() {
    $('#timeline').innerHTML = [...S().batches].reverse().map(b => {
      const v = b.verdict;
      const cls = b.frozen ? 'released' : v.status === 'passed' ? 'pass' : 'blocked';
      const label = b.frozen ? '已放行 · 冻结' : v.status === 'passed' ? '通过 · 待放行' : '阻断';
      return `<button class="batch-item ${b.id === active().id ? 'active' : ''}" data-action="select" data-id="${esc(b.id)}">
        <div class="batch-top"><b>${esc(b.id)}</b><span class="badge ${cls}">${label}</span></div>
        <div class="batch-reason">${esc(b.reason)}</div>
        <div class="batch-meta">${b.kind === 'initial' ? '首次导入' : '重检'} · ${esc(b.at)} · ${b.entries.length} 条目</div>
      </button>`;
    }).join('');
  }

  /* ---------- 批次详情 ---------- */
  function entryRow(b, e) {
    const info = D.licenseInfo(e.license);
    const ch = D.channelById(e.channel);
    const riskCls = info.risk === 'high' ? 'bad' : info.risk === 'medium' ? 'warn' : 'good';
    const risk = `<span class="badge ${riskCls}" title="${esc(info.note)}">${D.RISK_LABEL[info.risk]}</span>`;
    const digestCell = `<td class="mono muted" title="${esc(e.digest || '无摘要，按名称@版本归并')}">${esc(shortDigest(e.digest))}</td>`;
    if (b.frozen) {
      return `<tr>
        <td><b>${esc(e.name)}</b> <span class="muted">@${esc(e.version)}</span></td>
        <td class="mono">${esc(e.license)}</td>${digestCell}
        <td>${esc(ch.name)}${ch.closed ? ' <span class="tag closed">闭源</span>' : ''}</td>
        <td>${esc(D.purposeById(e.purpose).name)}</td>
        <td class="mono">${e.declared ? '✓' : '✗'} / ${e.verified ? '✓' : '✗'}</td>
        <td>${risk}</td><td>${esc(e.owner || '—')}</td><td>${esc(e.deadline || '—')}</td><td></td>
      </tr>`;
    }
    return `<tr>
      <td><b>${esc(e.name)}</b> <span class="muted">@${esc(e.version)}</span></td>
      <td><select data-field="license" data-eid="${e.id}">${licenseOptions(e.license)}</select></td>${digestCell}
      <td><select data-field="channel" data-eid="${e.id}">${D.CHANNELS.map(c => `<option value="${c.id}" ${c.id === e.channel ? 'selected' : ''}>${esc(c.name)}${c.closed ? '（闭源）' : ''}</option>`).join('')}</select></td>
      <td><select data-field="purpose" data-eid="${e.id}">${D.PURPOSES.map(p => `<option value="${p.id}" ${p.id === e.purpose ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
      <td class="evi">
        <button class="tog ${e.declared ? 'on' : ''}" data-action="toggle" data-field="declared" data-eid="${e.id}" title="包内是否附带许可证声明">声明</button>
        <button class="tog ${e.verified ? 'on' : ''}" data-action="toggle" data-field="verified" data-eid="${e.id}" title="是否完成人工核验">核验</button>
      </td>
      <td>${risk}</td>
      <td><input class="mini" data-field="owner" data-eid="${e.id}" value="${esc(e.owner)}" placeholder="责任人"></td>
      <td><input class="mini" type="date" data-field="deadline" data-eid="${e.id}" value="${esc(e.deadline)}"></td>
      <td><button class="icon" data-action="remove" data-eid="${e.id}" title="移除条目">×</button></td>
    </tr>`;
  }

  function gateHtml(b) {
    const v = b.verdict;
    return `<div class="gate ${v.status}">
      <div class="gate-head">
        <div><span class="label">门禁裁决${b.frozen ? '（已冻结）' : ''}</span><h3>${v.status === 'passed' ? '门禁通过，可放行' : '门禁阻断，禁止放行'}</h3></div>
        <span class="eval-at">评估时间 ${esc(v.at)}</span>
      </div>
      <div class="rules">${v.rules.map(r => `
        <div class="rule ${r.violations.length ? 'fail' : 'ok'}">
          <div class="rule-head"><b>${r.id} · ${esc(r.name)}</b><span>${r.violations.length ? `${r.violations.length} 项违规` : '通过'}</span></div>
          <p>${esc(r.desc)}</p>
          ${r.violations.length ? `<ul>${r.violations.map(x => `<li><b>${esc(x.entry.name)}@${esc(x.entry.version)}</b> — ${esc(x.detail)}</li>`).join('')}</ul>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  function diffHtml(b) {
    const d = b.diff;
    const groups = [
      d.added.length ? `<div class="diff-group"><b class="add">新增</b>${d.added.map(e => `<span class="tag">${esc(e.name)}@${esc(e.version)}</span>`).join('')}</div>` : '',
      d.removed.length ? `<div class="diff-group"><b class="del">移除</b>${d.removed.map(e => `<span class="tag">${esc(e.name)}@${esc(e.version)}</span>`).join('')}</div>` : '',
      d.changed.length ? `<div class="diff-group"><b class="mod">变更</b>${d.changed.map(c => `<div class="chg"><span class="tag">${esc(c.name)}@${esc(c.version)}</span>${c.fields.map(f => `<code>${esc(f.label)}: ${esc(fmtVal(f.field, f.from))} → ${esc(fmtVal(f.field, f.to))}</code>`).join('')}</div>`).join('')}</div>` : '',
    ].join('');
    return `<div class="diff">
      <div class="diff-head"><span class="label">批次差异</span><span>相对 ${b.baseId ? esc(b.baseId) : '空基线'} · 随刷新同步</span></div>
      <div><span class="chip add">新增 ${d.added.length}</span><span class="chip del">移除 ${d.removed.length}</span><span class="chip mod">变更 ${d.changed.length}</span></div>
      ${groups || '<p class="muted small">与基线一致，无差异。</p>'}
    </div>`;
  }

  function renderDetail() {
    const b = active();
    const v = b.verdict;
    const frozen = b.frozen;
    const canRelease = !frozen && v.status === 'passed';
    $('#batchPanel').innerHTML = `
      <div class="batch-head">
        <div>
          <span class="label">${b.kind === 'initial' ? '首次导入' : '重检批次'}${b.baseId ? ` · 基线 ${esc(b.baseId)}` : ''}</span>
          <h2>${esc(b.id)} ${frozen ? '<span class="lock">🔒 已放行</span>' : ''}</h2>
          <p class="reason">${esc(b.reason)}</p>
          <p class="muted small">创建于 ${esc(b.at)}${b.releasedAt ? ` · 放行于 ${esc(b.releasedAt)}` : ''} · ${b.entries.length} 个条目</p>
        </div>
        <div class="batch-actions">
          ${frozen ? '' : '<button data-action="refresh">刷新门禁</button>'}
          ${frozen ? '' : `<button class="primary" data-action="release" ${canRelease ? '' : 'disabled title="门禁未通过，禁止放行"'}>放行并冻结</button>`}
          <button data-action="recheck">以此批次重检</button>
        </div>
      </div>
      ${gateHtml(b)}
      <div class="tablewrap"><table class="entries"><thead><tr>
        <th>组件</th><th>许可证</th><th>来源摘要</th><th>渠道</th><th>用途</th><th>证据 声明/核验</th><th>风险</th><th>责任人</th><th>整改期限</th><th></th>
      </tr></thead><tbody>${b.entries.map(e => entryRow(b, e)).join('') || '<tr><td colspan="10" class="muted">暂无条目</td></tr>'}</tbody></table></div>
      ${frozen ? '' : `<details class="addbox"><summary>手动添加条目</summary>
        <div class="addgrid">
          <input id="fName" placeholder="包名，如 react">
          <input id="fVersion" placeholder="版本，如 18.3.1">
          <select id="fLicense">${licenseOptions('MIT')}</select>
          <input id="fDigest" placeholder="来源摘要，如 sha256:…">
          <select id="fChannel">${D.CHANNELS.map(c => `<option value="${c.id}">${esc(c.name)}${c.closed ? '（闭源）' : ''}</option>`).join('')}</select>
          <select id="fPurpose">${D.PURPOSES.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
          <button class="primary" data-action="addEntry">添加条目</button>
        </div>
        <p class="hint">新条目默认缺少包内声明与人工核验，补齐证据后门禁才会放行。</p>
      </details>`}
      ${diffHtml(b)}`;
  }

  /* ---------- 组件台帐（重复摘要只合并批次） ---------- */
  function renderLedger() {
    const rows = D.ledger();
    $('#ledger').innerHTML = `
      <p class="hint">相同来源摘要的组件只保留一条台帐，批次关联自动合并；信息以最新批次为准。</p>
      <div class="ledger-row ledger-head"><div>组件</div><div>许可证</div><div>来源摘要</div><div>渠道</div><div>出现批次</div></div>
      ${rows.map(c => `<div class="ledger-row">
        <div><b>${esc(c.name)}</b> <span class="muted">@${esc(c.version)}</span></div>
        <div class="mono">${esc(c.license)}</div>
        <div class="mono muted">${esc(c.digest || '—（按名称@版本归并）')}</div>
        <div>${c.channels.map(id => esc(D.channelById(id).name)).join('、')}</div>
        <div>${c.batches.map(id => `<span class="tag">${esc(id)}</span>`).join('')}</div>
      </div>`).join('')}`;
  }

  function renderBaseLine() {
    const base = baseForNew ? D.batchById(baseForNew) : active();
    $('#baseLine').textContent = `基线批次：${base ? base.id : '无（首次导入）'} · 相同摘要将继承基线证据`;
  }

  function render() {
    renderMetrics();
    renderTimeline();
    renderDetail();
    renderLedger();
    renderBaseLine();
  }

  /* ---------- 交互 ---------- */
  function onPanelClick(ev) {
    const t = ev.target.closest('[data-action]');
    if (!t) return;
    const b = active();
    const { action, eid, field } = t.dataset;
    if (action === 'toggle') {
      const e = b.entries.find(x => x.id === eid);
      if (e) D.updateEntry(b.id, eid, { [field]: !e[field] });
    } else if (action === 'remove') {
      D.removeEntry(b.id, eid);
    } else if (action === 'addEntry') {
      const name = $('#fName').value.trim();
      if (!name) { status('请填写包名'); return; }
      D.addEntry(b.id, D.entry(name, $('#fVersion').value.trim() || '—', $('#fLicense').value, $('#fDigest').value.trim(), $('#fChannel').value, $('#fPurpose').value));
      status(`已加入 ${name}，待补证据`);
    } else if (action === 'refresh') {
      D.refresh(b.id);
      status(`已刷新 ${b.id}：批次、差异与门禁重新对齐`);
    } else if (action === 'release') {
      if (!confirm(`放行后 ${b.id} 的证据与裁决将冻结，之后只能以新批次重检。确认放行？`)) return;
      status(D.release(b.id) ? `${b.id} 已放行，证据与裁决已冻结` : '门禁未通过，禁止放行');
    } else if (action === 'recheck') {
      baseForNew = b.id;
      $('#importText').value = D.serialize(b.entries);
      $('#reason').value = '';
      $('#reason').focus();
      status(`以 ${b.id} 为基线重检：请填写重检原因后创建批次`);
    }
    render();
  }

  function onPanelChange(ev) {
    const t = ev.target.closest('[data-field]');
    if (!t || t.dataset.action === 'toggle') return;
    const b = active();
    if (b.frozen) return;
    D.updateEntry(b.id, t.dataset.eid, { [t.dataset.field]: t.value });
    render();
  }

  function createBatch() {
    const reason = $('#reason').value.trim();
    const isFirst = S().batches.length === 0;
    if (!isFirst && !reason) { status('重检批次必须填写原因'); $('#reason').focus(); return; }
    const base = baseForNew ? D.batchById(baseForNew) : (isFirst ? null : active());
    const { entries, dupCount } = D.parseLines($('#importText').value, base ? base.entries : []);
    if (!entries.length) { status('未解析到任何条目'); return; }
    const b = D.addBatch(isFirst ? 'initial' : 'recheck', reason || '首次导入', base ? base.id : null, entries);
    baseForNew = null;
    $('#reason').value = '';
    status(`已创建 ${b.id}：${entries.length} 个条目${dupCount ? `，合并重复摘要 ${dupCount} 条` : ''}；门禁${b.verdict.status === 'passed' ? '通过' : '阻断'}`);
    render();
  }

  function exportMd() {
    const b = active();
    const v = b.verdict;
    const d = b.diff;
    const lines = [
      `# License Lens 准入证据报告 · ${b.id}`, '',
      `- 批次类型：${b.kind === 'initial' ? '首次导入' : '重检'}`,
      `- 批次原因：${b.reason}`,
      `- 基线批次：${b.baseId || '—'}`,
      `- 创建时间：${b.at}`,
      `- 门禁结论：${v.status === 'passed' ? '通过' : '阻断'}（评估于 ${v.at}）`,
      `- 状态：${b.frozen ? `已放行（冻结于 ${b.releasedAt}）` : '未放行'}`, '',
      '## 门禁规则', '',
      '| 规则 | 结果 | 违规明细 |', '|---|---|---|',
      ...v.rules.map(r => `| ${r.id} ${r.name} | ${r.violations.length ? '阻断' : '通过'} | ${r.violations.map(x => `${x.entry.name}@${x.entry.version}：${x.detail}`).join('<br>') || '—'} |`),
      '', '## 条目清单', '',
      '| 包名 | 版本 | 许可证 | 来源摘要 | 渠道 | 用途 | 包内声明 | 人工核验 | 风险 | 责任人 | 整改期限 |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      ...b.entries.map(e => `| ${e.name} | ${e.version} | ${e.license} | ${e.digest || '—'} | ${D.channelById(e.channel).name} | ${D.purposeById(e.purpose).name} | ${yn(e.declared)} | ${yn(e.verified)} | ${D.RISK_LABEL[D.licenseInfo(e.license).risk]} | ${e.owner || '—'} | ${e.deadline || '—'} |`),
      '', '## 相对基线差异', '',
      `- 新增：${d.added.map(e => `${e.name}@${e.version}`).join('、') || '无'}`,
      `- 移除：${d.removed.map(e => `${e.name}@${e.version}`).join('、') || '无'}`,
      `- 变更：${d.changed.map(c => `${c.name}@${c.version}（${c.fields.map(f => `${f.label}: ${fmtVal(f.field, f.from)} → ${fmtVal(f.field, f.to)}`).join('；')}）`).join('、') || '无'}`,
      '',
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    a.download = `license-lens-${b.id}.md`;
    a.click();
    status(`已导出 ${b.id} 的 Markdown 报告`);
  }

  /* ---------- 启动 ---------- */
  $('#timeline').addEventListener('click', ev => {
    const t = ev.target.closest('[data-action="select"]');
    if (t) { D.setActive(t.dataset.id); render(); }
  });
  $('#batchPanel').addEventListener('click', onPanelClick);
  $('#batchPanel').addEventListener('change', onPanelChange);
  $('#createBatch').addEventListener('click', createBatch);
  $('#export').addEventListener('click', exportMd);
  $('#reset').addEventListener('click', () => {
    if (confirm('恢复内置示例数据？当前修改将丢失。')) { D.reset(); baseForNew = null; $('#importText').value = D.serialize(active().entries); render(); status('已恢复示例数据'); }
  });

  $('#importText').value = D.serialize(active().entries);
  render();
})();
