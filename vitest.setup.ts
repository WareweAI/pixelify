import { beforeEach, vi } from 'vitest';

// Setup localStorage mock that behaves like real localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    },
  };
})();

global.localStorage = localStorageMock as Storage;

// Setup fetch mock
global.fetch = vi.fn();

// Clear mocks before each test
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
