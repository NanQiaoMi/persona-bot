import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>;

export function withAuth(handler: RouteHandler) {
  return async (req: AuthenticatedRequest, context?: unknown) => {
    try {
      const authHeader = req.headers.get('authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { success: false, error: { code: '1001', message: '未提供认证token' } },
          { status: 401 }
        );
      }

      const token = authHeader.split(' ')[1];
      const payload = verifyToken(token);

      req.user = payload;

      return handler(req, context);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: '1002', message: 'token无效或已过期' } },
        { status: 401 }
      );
    }
  };
}

export function withAdminAuth(handler: RouteHandler) {
  return withAuth(async (req: AuthenticatedRequest, context?: unknown) => {
    if (req.user?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: '1005', message: '需要管理员权限' } },
        { status: 403 }
      );
    }
    return handler(req, context);
  });
}
