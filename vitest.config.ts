import { defineConfig } from 'vitest/config';
import os from 'os';
import path from 'path';

// 每次测试运行使用独立的临时数据目录，绝不读写项目里的真实 exes/ 与 .data/
const testDataRoot = path.join(os.tmpdir(), `personabot-test-${process.pid}-${Date.now()}`);

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    env: {
      PERSONABOT_DATA_ROOT: testDataRoot,
    },
    globalSetup: ['./tests/setup/isolated-data-root.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
