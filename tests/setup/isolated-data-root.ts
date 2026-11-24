import fs from 'fs/promises';
import type { TestProject } from 'vitest/node';

/**
 * 测试开始前创建隔离的数据目录，结束后删除，保证测试不会碰到真实角色数据
 */
export default async function setup(project: TestProject) {
  const root = project.config.env?.PERSONABOT_DATA_ROOT;
  if (!root || root === process.cwd()) {
    throw new Error('PERSONABOT_DATA_ROOT 未指向隔离目录，拒绝在真实数据上运行测试');
  }
  await fs.mkdir(root, { recursive: true });
  return async () => {
    await fs.rm(root, { recursive: true, force: true });
  };
}
