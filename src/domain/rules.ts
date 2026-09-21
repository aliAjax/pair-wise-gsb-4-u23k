// 门禁规则层：纯函数，只依赖数据模型与许可证知识库，不依赖界面。
import { licenseInfoOf } from '../data/licenses';
import type { Channel, LicenseInfo, Violation } from '../domain/types';

/** 门禁评估的最小输入：证据字段 + 批次字段 */
export interface GateItem {
  name: string;
  version: string;
  license: string;
  declaredInPackage: boolean;
  manualVerified: boolean;
  channel: Channel;
  owner: string;
  deadline: string;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  /** 命中时返回违规说明，否则返回 null */
  check: (item: GateItem, info: LicenseInfo) => string | null;
}

export const RULES: Rule[] = [
  {
    id: 'require-declaration-or-review',
    name: '缺包内声明或人工核验',
    description: '组件须具备包内许可证声明或人工核验记录，两者皆缺时禁止放行。',
    check: item =>
      !item.declaredInPackage && !item.manualVerified
        ? `未在包内发现许可证声明，且缺少人工核验记录（当前识别为 ${item.license}）`
        : null,
  },
  {
    id: 'high-risk-owner-deadline',
    name: '高风险未定责任人与期限',
    description: '高风险许可证组件必须同时指定责任人与整改期限，缺一即禁止放行。',
    check: (item, info) => {
      if (info.risk !== 'high') return null;
      const missing: string[] = [];
      if (!item.owner.trim()) missing.push('责任人');
      if (!item.deadline.trim()) missing.push('整改期限');
      return missing.length ? `高风险许可证 ${item.license} 未指定${missing.join('与')}` : null;
    },
  },
  {
    id: 'no-gpl-closed-channel',
    name: 'GPL 系用于闭源渠道',
    description: 'GPL 系（GPL / AGPL 等 Copyleft）许可证组件不得进入闭源分发渠道。',
    check: (item, info) =>
      info.gplFamily && item.channel === '闭源分发'
        ? `${item.license} 属于 GPL 系 Copyleft，当前渠道为「闭源分发」`
        : null,
  },
];

/** 对一批条目执行全部门禁规则，返回违规列表（空 = 门禁通过） */
export function evaluateBatch(items: GateItem[]): Violation[] {
  const violations: Violation[] = [];
  for (const item of items) {
    const info = licenseInfoOf(item.license);
    for (const rule of RULES) {
      const detail = rule.check(item, info);
      if (detail) {
        violations.push({ ruleId: rule.id, ruleName: rule.name, pkg: `${item.name}@${item.version}`, detail });
      }
    }
  }
  return violations;
}
