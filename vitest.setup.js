import '@testing-library/jest-dom/vitest';

// Node 26 exposes an experimental global `localStorage` that is unavailable
// unless `--localstorage-file` is passed, and it shadows the one jsdom would
// provide. Install a small in-memory Storage so the leaderboard's localStorage
// fallback can be exercised in unit tests.
class MemoryStorage {
  #store = new Map();

  get length() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }

  getItem(key) {
    const stringKey = String(key);
    return this.#store.has(stringKey) ? this.#store.get(stringKey) : null;
  }

  setItem(key, value) {
    this.#store.set(String(key), String(value));
  }

  removeItem(key) {
    this.#store.delete(String(key));
  }

  key(index) {
    return [...this.#store.keys()][index] ?? null;
  }
}

const memoryStorage = new MemoryStorage();
const targets = new Set([globalThis]);
if (typeof window !== 'undefined') {
  targets.add(window);
}
for (const target of targets) {
  try {
    Object.defineProperty(target, 'localStorage', {
      value: memoryStorage,
      configurable: true,
      writable: true,
    });
  } catch {
    // Host forbids redefining the global; the in-memory store on globalThis is enough.
  }
}
