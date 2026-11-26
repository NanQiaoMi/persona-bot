import { NextResponse } from 'next/server';
import {
  addUserMomentCommentAndReply,
  ensureInitialMoments,
  generateNewMomentPost,
  isAutoMomentInFlight,
  maybeAutoPublishMoment,
  MomentSkippedError,
  toggleMomentLike,
} from '@/lib/persona/moments';
import { storageRepo } from '@/lib/storage/repository';
import { MomentTopic } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const [persona, allPersonas] = await Promise.all([
      storageRepo.getPersona(decodedSlug),
      storageRepo.listPersonas(),
    ]);

    if (!persona) {
      return NextResponse.json(
        { success: false, error: 'Persona not found' },
        { status: 404 }
      );
    }

    const posts = await ensureInitialMoments(persona, allPersonas);
    if (!process.env.VITEST) {
      void maybeAutoPublishMoment(decodedSlug, 'visit').catch(() => {});
    }
    return NextResponse.json({
      success: true,
      posts,
      autoPublishing: isAutoMomentInFlight(decodedSlug),
    });
  } catch (error) {
    console.error('Get moments error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load moments' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const body = await request.json();
    const { action, postId, content, topic, hint } = body || {};

    if (action === 'generate') {
      const validTopic: MomentTopic | undefined =
        topic && ['travel', 'scenery', 'food', 'selfie', 'daily', 'night'].includes(topic)
          ? (topic as MomentTopic)
          : undefined;
      let res: Awaited<ReturnType<typeof generateNewMomentPost>>;
      try {
        res = await generateNewMomentPost(decodedSlug, {
          topic: validTopic,
          hint: typeof hint === 'string' ? hint : undefined,
        });
      } catch (err) {
        // 想不出和最近不重复的内容：不算出错，告诉页面这次没发
        if (err instanceof MomentSkippedError) {
          return NextResponse.json({ success: false, skipped: true, message: err.message });
        }
        throw err;
      }
      return NextResponse.json({
        success: true,
        post: res.post,
        posts: res.posts,
      });
    }

    if (action === 'toggle_like') {
      if (!postId || typeof postId !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Missing postId' },
          { status: 400 }
        );
      }
      const posts = await toggleMomentLike(decodedSlug, postId);
      return NextResponse.json({ success: true, posts });
    }

    if (action === 'comment') {
      if (!postId || typeof postId !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Missing postId' },
          { status: 400 }
        );
      }
      if (!content || typeof content !== 'string' || !content.trim()) {
        return NextResponse.json(
          { success: false, error: '评论内容不能为空' },
          { status: 400 }
        );
      }
      const res = await addUserMomentCommentAndReply(
        decodedSlug,
        postId,
        content
      );
      return NextResponse.json({
        success: true,
        posts: res.posts,
        replyComment: res.replyComment,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported action' },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Moments action failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
