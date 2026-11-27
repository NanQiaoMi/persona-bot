import { NextResponse } from 'next/server';
import { getOrInitDailyLife } from '@/lib/persona/daily-life';
import { storageRepo } from '@/lib/storage/repository';
import type { DailyLifeState } from '@/lib/storage/types';

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }
    const dailyLife = await getOrInitDailyLife(persona);
    return NextResponse.json({ success: true, dailyLife });
  } catch (error) {
    console.error('Get daily-life error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取今日心境失败' } },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: { code: '4001', message: '请求体格式不正确' } },
        { status: 400 }
      );
    }

    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    const rawMain = (body as { mainEvent?: unknown }).mainEvent;
    const rawMood = (body as { moodTone?: unknown }).moodTone;
    const nextMain =
      typeof rawMain === 'string' ? rawMain.replace(/[\r\n]+/g, ' ').trim().slice(0, 160) : undefined;
    const nextMood =
      typeof rawMood === 'string' ? rawMood.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) : undefined;

    if (!nextMain && !nextMood) {
      return NextResponse.json(
        { success: false, error: { code: '4002', message: '请填写今日主线事件或今日心境' } },
        { status: 400 }
      );
    }

    const current = await getOrInitDailyLife(persona);
    const updated: DailyLifeState = {
      ...current,
      ...(nextMain ? { mainEvent: nextMain } : {}),
      ...(nextMood ? { moodTone: nextMood } : {}),
      updatedAt: new Date().toISOString(),
    };
    const saved = await storageRepo.saveDailyLife(persona.slug, updated);
    return NextResponse.json({ success: true, dailyLife: saved });
  } catch (error) {
    console.error('Update daily-life error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '更新今日心境失败' } },
      { status: 500 }
    );
  }
}
