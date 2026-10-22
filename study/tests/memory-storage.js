// テスト用の localStorage 代わり
export class MemoryStorage {
    constructor(initial = {}) {
        this.map = new Map(Object.entries(initial));
    }
    getItem(key) {
        return this.map.has(key) ? this.map.get(key) : null;
    }
    setItem(key, value) {
        this.map.set(key, String(value));
    }
    removeItem(key) {
        this.map.delete(key);
    }
}
