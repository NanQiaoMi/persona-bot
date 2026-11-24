import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveDataRoot } from '@/lib/storage/repository';

describe('test data isolation', () => {
  it('points storage at a temporary directory instead of the project data', () => {
    const root = resolveDataRoot();
    expect(process.env.PERSONABOT_DATA_ROOT).toBeTruthy();
    expect(root).toBe(path.resolve(process.env.PERSONABOT_DATA_ROOT!));
    expect(root).not.toBe(process.cwd());
  });
});
