import NodeCache from 'node-cache';

export class RateLimiter {
  private cache: NodeCache;

  constructor(defaultTtl: number = 3600) { // 1 hour default
    this.cache = new NodeCache({ stdTTL: defaultTtl, checkperiod: 60 });
  }

  private getKey(userId: string, command: string): string {
    return `${userId}:${command}`;
  }

  isLimited(userId: string, command: string, cooldownMs: number): boolean {
    const key = this.getKey(userId, command);
    const lastUsed = this.cache.get<number>(key);
    
    if (!lastUsed) {
      this.cache.set(key, Date.now(), Math.ceil(cooldownMs / 1000));
      return false;
    }

    const timeSince = Date.now() - lastUsed;
    if (timeSince >= cooldownMs) {
      this.cache.set(key, Date.now(), Math.ceil(cooldownMs / 1000));
      return false;
    }

    return true;
  }

  getRemaining(userId: string, command: string): number {
    const key = this.getKey(userId, command);
    const lastUsed = this.cache.get<number>(key);
    
    if (!lastUsed) return 0;
    
    const ttl = this.cache.getTtl(key);
    if (!ttl) return 0;
    
    return Math.max(0, ttl - Date.now());
  }

  resetCooldown(userId: string, command: string): void {
    const key = this.getKey(userId, command);
    this.cache.del(key);
  }

  clearUserCooldowns(userId: string): void {
    const keys = this.cache.keys();
    const userKeys = keys.filter(key => key.startsWith(`${userId}:`));
    this.cache.del(userKeys);
  }

  getStats(): { hits: number, misses: number, keys: number, ksize: number, vsize: number } {
    return this.cache.getStats();
  }
}
