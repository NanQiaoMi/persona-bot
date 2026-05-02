export interface IsolatedContext {
  userId: string;
  personaSlug: string;
  conversationId: string;
  metadata: Record<string, unknown>;
}

export class ContextIsolation {
  private contexts: Map<string, IsolatedContext> = new Map();

  private getContextKey(userId: string, personaSlug: string): string {
    return `${userId}:${personaSlug}`;
  }

  createContext(userId: string, personaSlug: string): IsolatedContext {
    const key = this.getContextKey(userId, personaSlug);

    if (this.contexts.has(key)) {
      return this.contexts.get(key)!;
    }

    const context: IsolatedContext = {
      userId,
      personaSlug,
      conversationId: `${userId}_${personaSlug}_${Date.now()}`,
      metadata: {}
    };

    this.contexts.set(key, context);
    return context;
  }

  getContext(userId: string, personaSlug: string): IsolatedContext | undefined {
    const key = this.getContextKey(userId, personaSlug);
    return this.contexts.get(key);
  }

  updateMetadata(userId: string, personaSlug: string, metadata: Record<string, unknown>): void {
    const key = this.getContextKey(userId, personaSlug);
    const context = this.contexts.get(key);

    if (context) {
      context.metadata = { ...context.metadata, ...metadata };
    }
  }

  clearContext(userId: string, personaSlug: string): void {
    const key = this.getContextKey(userId, personaSlug);
    this.contexts.delete(key);
  }

  clearAllUserContexts(userId: string): void {
    for (const key of this.contexts.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.contexts.delete(key);
      }
    }
  }
}

export const contextIsolation = new ContextIsolation();
