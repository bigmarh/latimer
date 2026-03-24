interface LRUCacheOptions<K, V> {
  max?: number;
  maxSize?: number;
  ttl?: number;
  sizeCalculation?: (value: V, key: K) => number;
}

export class LRUCache<K, V> {
  private readonly max: number;
  private readonly map = new Map<K, V>();

  constructor(options: LRUCacheOptions<K, V> = {}) {
    const limit = options.max ?? options.maxSize ?? 1000;
    this.max = limit > 0 ? limit : 1000;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    if (!this.map.has(key)) return false;

    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return true;
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;

    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

export default {
  LRUCache,
};
