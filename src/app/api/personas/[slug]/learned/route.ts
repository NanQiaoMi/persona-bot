import { NextResponse } from 'next/server';
import { applyLearnedAction, LearnedAction } from '@/lib/persona/learned';
import { ensurePersonaSpec } from '@/lib/persona/spec';
import { averageOf } from '@/lib/persona/trial';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaRecord } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

const ACTIONS: LearnedAction[] = ['retire', 'restore', 'lock', 'unlock', 'edit'];

function growthPayload(persona: PersonaRecord) {
  const spec = ensurePersonaSpec(persona.personaMd, persona.spec);
  const avg = averageOf(spec.recentQuality);
  return {
    learned: spec.learned,
    recentQuality: spec.recentQuality || [],
    averageQuality: avg === undefined ? null : Math.round(avg),
    fingerprint: spec.fingerprint || null,
    traits: spec.traits || null,
    pendingSignals: persona.evolution?.pendingSignals ?? 0,
  };
}

/** 成长日志：角色学到的习惯 / 说话方式 / 纠偏，以及最近的回复质量 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const persona = await storageRepo.getPersona(decodeURIComponent(slug));
  if (!persona) {
    return NextResponse.json({ success: false, error: '角色不存在' }, { status: 404 });
  }
  return NextResponse.json({ success: true, ...growthPayload(persona) });
}

/** 撤销 / 恢复 / 锁定 / 解锁 / 编辑一条学到的规则 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    const action = body.action as LearnedAction;
    if (!id || !ACTIONS.includes(action)) {
      return NextResponse.json({ success: false, error: '缺少条目 id 或操作不支持' }, { status: 400 });
    }

    let error: string | undefined;
    const updated = await storageRepo.updatePersona(decodeURIComponent(slug), (persona) => {
      const res = applyLearnedAction(ensurePersonaSpec(persona.personaMd, persona.spec), id, action, {
        text: typeof body.text === 'string' ? body.text : undefined,
      });
      if (res.error) {
        error = res.error;
        return null;
      }
      return { ...persona, spec: res.spec };
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: '角色不存在' }, { status: 404 });
    }
    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }
    return NextResponse.json({ success: true, persona: updated, ...growthPayload(updated) });
  } catch (err) {
    console.error('Learned item update error:', err);
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}
