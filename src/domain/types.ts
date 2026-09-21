// 数据模型：证据、批次、门禁结果。本层只描述数据，不含规则与界面逻辑。

export type Channel = '闭源分发' | '内部使用' | 'SaaS 服务' | '开源发布';
export type Usage = '生产依赖' | '开发工具' | '测试依赖' | '运行时捆绑';
export type Risk = 'low' | 'medium' | 'high';
export type BatchStatus = 'pending' | 'blocked' | 'released';
export type LicenseFamily =
  | 'permissive'
  | 'weak-copyleft'
  | 'strong-copyleft'
  | 'network-copyleft'
  | 'public-domain'
  | 'other'
  | 'unknown';

export const CHANNELS: Channel[] = ['闭源分发', '内部使用', 'SaaS 服务', '开源发布'];
export const USAGES: Usage[] = ['生产依赖', '开发工具', '测试依赖', '运行时捆绑'];

/** 许可证知识库条目（数据） */
export interface LicenseInfo {
  id: string;
  family: LicenseFamily;
  risk: Risk;
  gplFamily: boolean;
  note: string;
}

/** 证据记录：同一「包名 + 版本 + 来源摘要」只保留一条，重复时仅合并批次 */
export interface Evidence {
  id: string;
  name: string;
  version: string;
  license: string;
  summary: string; // 来源摘要
  declaredInPackage: boolean; // 包内是否存在许可证声明
  manualVerified: boolean; // 是否经过人工核验
  batchIds: string[]; // 引用该证据的批次（重复摘要只合并到这里）
}

/** 批次内的条目：渠道 / 用途 / 责任人 / 期限按批次记录 */
export interface BatchEntry {
  evidenceId: string;
  channel: Channel;
  usage: Usage;
  owner: string; // 责任人
  deadline: string; // 整改期限
}

/** 解析后的条目（证据字段 + 批次字段），放行时以此冻结快照 */
export interface FrozenEntry extends BatchEntry {
  name: string;
  version: string;
  license: string;
  summary: string;
  declaredInPackage: boolean;
  manualVerified: boolean;
}

/** 门禁违规记录 */
export interface Violation {
  ruleId: string;
  ruleName: string;
  pkg: string; // name@version
  detail: string;
}

/** 与来源批次的差异 */
export interface ChangeItem {
  kind: 'added' | 'removed' | 'changed';
  pkg: string;
  detail: string;
}

/** 放行裁决，放行后冻结 */
export interface Verdict {
  decision: 'released';
  at: string;
  by: string;
}

export interface Batch {
  id: string;
  seq: number;
  createdAt: string;
  reason: string; // 创建 / 重检原因
  sourceBatchId: string | null; // 重检来源批次
  status: BatchStatus;
  entries: BatchEntry[];
  violations: Violation[]; // 最近一次门禁评估结果
  changes: ChangeItem[]; // 相对来源批次的差异
  verdict: Verdict | null;
  snapshot: FrozenEntry[] | null; // 放行后冻结的证据快照
}

export interface Store {
  evidence: Evidence[];
  batches: Batch[];
  nextSeq: number;
}

/** 新建 / 导入批次时的草稿条目 */
export interface DraftEntry {
  name: string;
  version: string;
  license: string;
  summary: string;
  declaredInPackage: boolean;
  manualVerified: boolean;
  channel: Channel;
  usage: Usage;
  owner: string;
  deadline: string;
}
