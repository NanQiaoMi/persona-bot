import { afterAll, describe, expect, it } from 'vitest';
import { applyLearnedAction } from '@/lib/persona/learned';
import { QUICK_CORRECTION_RULES, refineCorrection } from '@/lib/persona/correction';
import { admitCandidates } from '@/lib/persona/trial';
import { PersonaSpec } from '@/lib/persona/spec';
import { storageRepo } from '@/lib/storage/repository';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { GET, PATCH } from '@/app/api/personas/[slug]/learned/route';
import { POST as CORRECT } from '@/app/api/personas/[slug]/correct/route';

const SLUG = 'test-growth-log-bot';
const ctx = { params: Promise.resolve({ slug: SLUG }) };

function seedSpec(): PersonaSpec {
  return admitCandidates({ specVersion: 1, learned: [] }, [
    { kind: 'habit', text: '对方加班时先问吃饭没', source: 'llm' },
    { kind: 'style', text: '每轮带 2 个表情活跃气氛', source: 'llm' },
  ]).spec;
}

describe('growth log actions', () => {
  it('locks, unlocks, retires, restores and edits learned items', () => {
    let spec = seedSpec();
    const id = spec.learned[0].id;

    spec = applyLearnedAction(spec, id, 'lock').spec;
    expect(spec.learned[0].status).toBe('locked');
    spec = applyLearnedAction(spec, id, 'unlock').spec;
    expect(spec.learned[0].status).toBe('active');
    spec = applyLearnedAction(spec, id, 'retire').spec;
    expect(spec.learned[0].status).toBe('retired');
    expect(spec.learned[0].retiredReason).toContain('撤销');
    spec = applyLearnedAction(spec, id, 'restore').spec;
    expect(spec.learned[0].status).toBe('active');

    const edited = applyLearnedAction(spec, id, 'edit', { text: '对方加班时先叫他点外卖' });
    expect(edited.item?.text).toBe('对方加班时先叫他点外卖');
    expect(edited.item?.status).toBe('locked');
    expect(edited.item?.source).toBe('user-edit');

    expect(applyLearnedAction(spec, id, 'edit', { text: 'x' }).error).toBeTruthy();
    expect(applyLearnedAction(spec, 'nope', 'lock').error).toBe('条目不存在');
  });
});

describe('correction refinement', () => {
  it('maps quick chips to concrete rules and keeps free text offline', async () => {
    expect((await refineCorrection({ feedback: '太像AI' })).rule).toBe(QUICK_CORRECTION_RULES['太像AI']);
    const free = await refineCorrection({ feedback: '她生气时只会说随便你' });
    expect(free).toEqual({ rule: '她生气时只会说随便你', refined: false });
  });
});

describe('growth log & correction API', () => {
  afterAll(async () => {
    await storageRepo.deletePersona(SLUG);
  });

  it('lists learned items, applies an action and re-renders persona.md', async () => {
    await storageRepo.savePersona({ ...BUILTIN_PRESETS[1], slug: SLUG, isPreset: false, spec: seedSpec() });

    const listRes = await GET(new Request('http://localhost'), ctx);
    const list = await listRes.json();
    expect(list.success).toBe(true);
    const habit = list.learned.find((it: { kind: string }) => it.kind === 'habit');
    expect(habit.status).toBe('trial');

    const patchRes = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ id: habit.id, action: 'retire' }),
      }),
      ctx
    );
    const patched = await patchRes.json();
    expect(patched.success).toBe(true);
    expect(patched.persona.personaMd).not.toContain('对方加班时先问吃饭没');

    const bad = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ id: habit.id, action: 'explode' }) }),
      ctx
    );
    expect(bad.status).toBe(400);
  });

  it('a quick correction becomes a locked rule and vetoes trial rules on the same dimension', async () => {
    const res = await CORRECT(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ correction: '表情太多', botResponse: '好耶😆😆', userInput: '在吗' }),
      }),
      ctx
    );
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.rule).toBe(QUICK_CORRECTION_RULES['表情太多']);
    const learned = json.persona.spec.learned as Array<{ kind: string; status: string; text: string; dimension?: string }>;
    expect(learned.find((it) => it.kind === 'correction')?.status).toBe('locked');
    expect(learned.find((it) => it.kind === 'style' && it.dimension === 'emoji')?.status).toBe('retired');
    expect(json.persona.personaMd).toContain('应当：这类场景少用 emoji');
  });
});
