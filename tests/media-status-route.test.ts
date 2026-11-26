import { describe, expect, it } from 'vitest';
import { mediaFingerprint } from '@/lib/media/media-fingerprint';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage } from '@/lib/storage/types';

let seq = 0;

/** 每个用例用自己的临时角色，避免与其他测试文件共用同一份聊天记录 */
async function seedPersonaChat(messages: ConversationMessage[]) {
  await storageRepo.listPersonas();
  const base = await storageRepo.getPersona('xia-you');
  const slug = `media-status-${process.pid}-${seq++}`;
  await storageRepo.savePersona({ ...base!, slug, name: '轮询测试', isPreset: false });
  await storageRepo.saveConversation(slug, messages);
  return slug;
}

async function callStatus(query: string) {
  const { GET } = await import('@/app/api/media/status/route');
  const res = await GET(new Request(`http://localhost/api/media/status?${query}`));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const generatingPhotoMessage = (id: string): ConversationMessage => ({
  id,
  role: 'assistant',
  content: '给你看',
  timestamp: new Date().toISOString(),
  mediaCards: [{ type: 'photo', caption: '窗边的猫', status: 'generating' }],
});

describe('GET /api/media/status', () => {
  it('既没有 slug 也没有 groupId 时返回 400 与 success:false', async () => {
    const { status, body } = await callStatus('');
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('单聊：返回待出图数量与和完整消息一致的指纹', async () => {
    const slug = await seedPersonaChat([generatingPhotoMessage('status-msg-1')]);
    const { status, body } = await callStatus(`slug=${slug}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pending).toBe(1);

    const saved = await storageRepo.getConversation(slug, 100);
    expect(body.fingerprint).toBe(mediaFingerprint(saved));
  });

  it('单聊：图片生成完成（带 imageUrl 且 status 为 ready）后指纹变化，pending 变为 0', async () => {
    const slug = await seedPersonaChat([generatingPhotoMessage('status-msg-2')]);
    const before = await callStatus(`slug=${slug}`);

    await storageRepo.updateConversationMessage(slug, 'status-msg-2', (m) => ({
      ...m,
      mediaCards: [{ ...m.mediaCards![0], status: 'ready', imageUrl: '/generated/cat.png' }],
    }));

    const after = await callStatus(`slug=${slug}`);
    expect(after.body.success).toBe(true);
    expect(after.body.fingerprint).not.toBe(before.body.fingerprint);
    expect(after.body.pending).toBe(0);
  });

  it('群聊 groupId：返回待出图数量与和群消息一致的指纹，生成完成后 pending 变为 0', async () => {
    const group = await storageRepo.createGroup({ name: `轮询群-${process.pid}-${seq++}`, memberSlugs: [] });
    await storageRepo.saveGroupConversation(group.id, [generatingPhotoMessage('group-status-msg-1')]);

    const before = await callStatus(`groupId=${group.id}`);
    expect(before.status).toBe(200);
    expect(before.body.success).toBe(true);
    expect(before.body.pending).toBe(1);
    const saved = await storageRepo.getGroupConversation(group.id, 100);
    expect(before.body.fingerprint).toBe(mediaFingerprint(saved));

    await storageRepo.updateGroupMessage(group.id, 'group-status-msg-1', (m) => ({
      ...m,
      mediaCards: [{ ...m.mediaCards![0], status: 'ready', imageUrl: '/generated/group-cat.png' }],
    }));

    const after = await callStatus(`groupId=${group.id}`);
    expect(after.body.fingerprint).not.toBe(before.body.fingerprint);
    expect(after.body.pending).toBe(0);
  });
});
