// 种子数据：演示完整证据链 —— 首批放行冻结、重检被拦截、整改后待放行。
import { createBatch, releaseBatch } from '../domain/store';
import type { DraftEntry, Store } from '../domain/types';

const base = (d: Pick<DraftEntry, 'name' | 'version' | 'license' | 'summary'> & Partial<DraftEntry>): DraftEntry => ({
  declaredInPackage: true,
  manualVerified: false,
  channel: '闭源分发',
  usage: '生产依赖',
  owner: '',
  deadline: '',
  ...d,
});

export function seedStore(): Store {
  let store: Store = { evidence: [], batches: [], nextSeq: 1 };

  // 批次 1：首次准入，全部合规，直接放行并冻结
  store = createBatch(
    store,
    [
      base({ name: 'react', version: '18.3.1', license: 'MIT', summary: 'package.json license 字段：MIT' }),
      base({ name: 'lodash', version: '4.17.21', license: 'MIT', summary: '包内 LICENSE 文件：MIT' }),
      base({ name: 'axios', version: '1.7.2', license: 'MIT', summary: 'package.json license 字段：MIT' }),
      base({ name: 'zod', version: '3.23.8', license: 'MIT', summary: '包内 LICENSE 文件：MIT' }),
      base({ name: 'sharp', version: '0.33.4', license: 'Apache-2.0', summary: '包内 LICENSE 文件：Apache-2.0' }),
      base({ name: 'date-fns', version: '3.6.0', license: 'MIT', summary: 'package.json license 字段：MIT' }),
    ],
    '首次准入：Web 控制台 v2.5 依赖清单',
    null,
    '2026-09-02 10:24',
  );
  store = releaseBatch(store, store.batches[0].id, '张琳', '2026-09-02 16:40');

  // 批次 2：季度重检 —— 升级 axios、移除 date-fns、引入 GPL 组件与无声明组件，触发全部三条门禁规则
  const b1 = store.batches[0].id;
  store = createBatch(
    store,
    [
      base({ name: 'react', version: '18.3.1', license: 'MIT', summary: 'package.json license 字段：MIT' }),
      base({ name: 'lodash', version: '4.17.21', license: 'MIT', summary: '包内 LICENSE 文件：MIT' }),
      base({ name: 'axios', version: '1.8.4', license: 'MIT', summary: 'package.json license 字段：MIT' }),
      base({ name: 'zod', version: '3.23.8', license: 'MIT', summary: '包内 LICENSE 文件：MIT' }),
      base({ name: 'sharp', version: '0.33.4', license: 'Apache-2.0', summary: '包内 LICENSE 文件：Apache-2.0' }),
      base({ name: 'legacy-gpl', version: '2.4.0', license: 'GPL-3.0', summary: '扫描命中包内 LICENSE：GPL-3.0' }),
      base({ name: 'internal-utils', version: '0.9.1', license: 'UNKNOWN', summary: '包内未发现许可证声明', declaredInPackage: false }),
    ],
    '季度重检：升级 axios，引入 legacy-gpl 与 internal-utils',
    b1,
    '2026-09-15 09:18',
  );

  // 批次 3：整改重检 —— 移除 GPL 组件，internal-utils 经人工核验确认 BSD-3-Clause 并落实责任人与期限
  const b2 = store.batches[1].id;
  store = createBatch(
    store,
    [
      base({ name: 'react', version: '18.3.1', license: 'MIT', summary: 'package.json license 字段：MIT' }),
      base({ name: 'lodash', version: '4.17.21', license: 'MIT', summary: '包内 LICENSE 文件：MIT' }),
      base({ name: 'axios', version: '1.8.4', license: 'MIT', summary: 'package.json license 字段：MIT' }),
      base({ name: 'zod', version: '3.23.8', license: 'MIT', summary: '包内 LICENSE 文件：MIT' }),
      base({ name: 'sharp', version: '0.33.4', license: 'Apache-2.0', summary: '包内 LICENSE 文件：Apache-2.0' }),
      base({
        name: 'internal-utils',
        version: '0.9.1',
        license: 'BSD-3-Clause',
        summary: '人工核验：AUTHORS 声明 BSD-3-Clause',
        declaredInPackage: false,
        manualVerified: true,
        owner: '张琳',
        deadline: '2026-10-15',
      }),
    ],
    '整改重检：移除 legacy-gpl，补全 internal-utils 核验与责任人',
    b2,
    '2026-09-18 14:02',
  );

  return store;
}
