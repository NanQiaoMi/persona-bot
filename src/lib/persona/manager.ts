import { EmotionEngine, inferPersonalityTraits } from '../emotion/engine';
import { EmotionVector } from '../emotion/types';

export interface PersonaContext {
  slug: string;
  name: string;
  emotionEngine: EmotionEngine;
  lastActivity: Date;
  conversationId?: string;
}

export class PersonaManager {
  private activePersonas: Map<string, PersonaContext> = new Map();
  private personaPool: Map<string, PersonaContext> = new Map();
  private maxPoolSize: number = 10;

  async switchPersona(
    userId: string,
    targetSlug: string,
    targetName: string,
    personaMd: string,
    savedEmotionState?: Record<string, unknown>
  ): Promise<PersonaContext> {
    const cacheKey = `${userId}:${targetSlug}`;

    if (this.activePersonas.has(cacheKey)) {
      return this.activePersonas.get(cacheKey)!;
    }

    let context: PersonaContext;
    if (this.personaPool.has(cacheKey)) {
      context = this.personaPool.get(cacheKey)!;
      this.personaPool.delete(cacheKey);
    } else {
      const personality = inferPersonalityTraits(personaMd);
      const emotionEngine = savedEmotionState
        ? EmotionEngine.fromJSON(savedEmotionState, personality)
        : new EmotionEngine(personality);

      context = {
        slug: targetSlug,
        name: targetName,
        emotionEngine,
        lastActivity: new Date()
      };
    }

    const currentActive = this.activePersonas.get(userId);
    if (currentActive) {
      this.releaseToPool(userId, currentActive);
    }

    this.activePersonas.set(userId, context);
    context.lastActivity = new Date();

    return context;
  }

  getActivePersona(userId: string): PersonaContext | undefined {
    return this.activePersonas.get(userId);
  }

  private releaseToPool(userId: string, context: PersonaContext): void {
    const poolKey = `${userId}:${context.slug}`;

    if (this.personaPool.size >= this.maxPoolSize) {
      let oldestKey = '';
      let oldestTime = new Date();

      for (const [key, ctx] of this.personaPool.entries()) {
        if (ctx.lastActivity < oldestTime) {
          oldestTime = ctx.lastActivity;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.personaPool.delete(oldestKey);
      }
    }

    this.personaPool.set(poolKey, context);
  }

  getUserPersonas(userId: string): string[] {
    const personas: string[] = [];

    const active = this.activePersonas.get(userId);
    if (active) {
      personas.push(active.slug);
    }

    for (const [key, ctx] of this.personaPool.entries()) {
      if (key.startsWith(`${userId}:`) && !personas.includes(ctx.slug)) {
        personas.push(ctx.slug);
      }
    }

    return personas;
  }

  cleanupInactive(maxInactiveMinutes: number = 30): void {
    const now = new Date();
    const threshold = maxInactiveMinutes * 60 * 1000;

    for (const [key, ctx] of this.personaPool.entries()) {
      if (now.getTime() - ctx.lastActivity.getTime() > threshold) {
        this.personaPool.delete(key);
      }
    }
  }
}

export const personaManager = new PersonaManager();

setInterval(() => {
  personaManager.cleanupInactive(30);
}, 5 * 60 * 1000);
