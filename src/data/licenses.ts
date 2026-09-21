// 许可证知识库（纯数据）：风险等级、是否 GPL 系、处置说明。
import type { LicenseInfo } from '../domain/types';

export const LICENSES: Record<string, LicenseInfo> = {
  MIT: { id: 'MIT', family: 'permissive', risk: 'low', gplFamily: false, note: '宽松许可证，保留版权声明即可分发。' },
  ISC: { id: 'ISC', family: 'permissive', risk: 'low', gplFamily: false, note: '宽松许可证，条款与 MIT 等价。' },
  'BSD-2-Clause': { id: 'BSD-2-Clause', family: 'permissive', risk: 'low', gplFamily: false, note: '宽松许可证，保留声明即可。' },
  'BSD-3-Clause': { id: 'BSD-3-Clause', family: 'permissive', risk: 'low', gplFamily: false, note: '宽松许可证，额外禁止以作者名义背书。' },
  'Apache-2.0': { id: 'Apache-2.0', family: 'permissive', risk: 'low', gplFamily: false, note: '宽松许可证，含专利授权，需保留 NOTICE。' },
  Zlib: { id: 'Zlib', family: 'permissive', risk: 'low', gplFamily: false, note: '宽松许可证，不得歪曲来源。' },
  'CC0-1.0': { id: 'CC0-1.0', family: 'public-domain', risk: 'low', gplFamily: false, note: '公共领域奉献，无分发限制。' },
  Unlicense: { id: 'Unlicense', family: 'public-domain', risk: 'low', gplFamily: false, note: '公共领域奉献，无分发限制。' },
  'MPL-2.0': { id: 'MPL-2.0', family: 'weak-copyleft', risk: 'medium', gplFamily: false, note: '弱 Copyleft，修改过的 MPL 文件须开源。' },
  'LGPL-2.1': { id: 'LGPL-2.1', family: 'weak-copyleft', risk: 'medium', gplFamily: false, note: '弱 Copyleft，闭源分发须允许用户替换库（动态链接）。' },
  'LGPL-3.0': { id: 'LGPL-3.0', family: 'weak-copyleft', risk: 'medium', gplFamily: false, note: '弱 Copyleft，静态链接进闭源产品有风险。' },
  'CC-BY-4.0': { id: 'CC-BY-4.0', family: 'other', risk: 'medium', gplFamily: false, note: '署名许可，非软件许可证，用于代码需复核。' },
  Proprietary: { id: 'Proprietary', family: 'other', risk: 'medium', gplFamily: false, note: '私有许可，需确认授权范围与再分发权。' },
  'GPL-2.0': { id: 'GPL-2.0', family: 'strong-copyleft', risk: 'high', gplFamily: true, note: '强 Copyleft，衍生作品须以 GPL 发布。' },
  'GPL-3.0': { id: 'GPL-3.0', family: 'strong-copyleft', risk: 'high', gplFamily: true, note: '强 Copyleft，衍生作品须以 GPL-3.0 发布。' },
  'AGPL-3.0': { id: 'AGPL-3.0', family: 'network-copyleft', risk: 'high', gplFamily: true, note: '网络 Copyleft，SaaS 提供即触发开源义务。' },
  UNKNOWN: { id: 'UNKNOWN', family: 'unknown', risk: 'high', gplFamily: false, note: '未识别许可证，按高风险处理，须人工核验。' },
};

const ALIASES: Record<string, string> = {
  'APACHE': 'Apache-2.0', 'APACHE-2.0': 'Apache-2.0', 'APACHE 2.0': 'Apache-2.0', 'APACHE2': 'Apache-2.0',
  'MIT': 'MIT', 'ISC': 'ISC', 'ZLIB': 'Zlib',
  'BSD': 'BSD-3-Clause', 'BSD-3-CLAUSE': 'BSD-3-Clause', 'BSD-2-CLAUSE': 'BSD-2-Clause',
  'GPL2': 'GPL-2.0', 'GPLV2': 'GPL-2.0', 'GPL-2.0': 'GPL-2.0',
  'GPL3': 'GPL-3.0', 'GPLV3': 'GPL-3.0', 'GPL-3.0': 'GPL-3.0',
  'LGPL-2.1': 'LGPL-2.1', 'LGPL2.1': 'LGPL-2.1', 'LGPL-3.0': 'LGPL-3.0', 'LGPL3': 'LGPL-3.0',
  'AGPL': 'AGPL-3.0', 'AGPL-3.0': 'AGPL-3.0',
  'MPL-2.0': 'MPL-2.0', 'MPL2': 'MPL-2.0',
  'CC0': 'CC0-1.0', 'CC0-1.0': 'CC0-1.0', 'UNLICENSE': 'Unlicense', 'CC-BY-4.0': 'CC-BY-4.0',
  'PROPRIETARY': 'Proprietary', 'UNKNOWN': 'UNKNOWN', 'UNLICENSED': 'UNKNOWN', '': 'UNKNOWN',
};

/** 归一化许可证标识：常见别名映射到知识库主键，未收录的保留原样 */
export function normalizeLicense(raw: string): string {
  const t = raw.trim();
  if (!t) return 'UNKNOWN';
  const alias = ALIASES[t.toUpperCase()];
  if (alias) return alias;
  if (LICENSES[t]) return t;
  return t;
}

/** 查询许可证信息；未收录的按高风险未知许可证处理 */
export function licenseInfoOf(id: string): LicenseInfo {
  const known = LICENSES[id];
  if (known) return known;
  return {
    id,
    family: 'unknown',
    risk: 'high',
    gplFamily: /^(A?GPL|GPL)/i.test(id),
    note: '未收录的许可证，按高风险处理，须人工核验。',
  };
}
