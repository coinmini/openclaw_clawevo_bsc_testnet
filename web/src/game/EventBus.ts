type Listener = (...args: unknown[]) => void;

interface Entry {
  fn: Listener;
  ctx: unknown;
}

/**
 * Lightweight event bus for React ↔ Phaser communication.
 * Does NOT depend on Phaser so it can be safely imported during SSR.
 * Supports optional `context` binding (3rd arg) like Phaser.Events.EventEmitter.
 */
class SimpleEventBus {
  private listeners = new Map<string, Entry[]>();

  on(event: string, fn: Listener, context?: unknown): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({ fn, ctx: context });
    return this;
  }

  off(event: string, fn: Listener, context?: unknown): this {
    const entries = this.listeners.get(event);
    if (!entries) return this;
    this.listeners.set(
      event,
      entries.filter((e) => e.fn !== fn || e.ctx !== context),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    const entries = this.listeners.get(event);
    if (!entries) return this;
    for (const { fn, ctx } of entries) {
      fn.apply(ctx, args);
    }
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }
}

export const EventBus = new SimpleEventBus();
