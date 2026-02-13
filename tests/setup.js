// Test setup file
import { vi } from 'vitest';

// Mock localStorage for all tests
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i) => Object.keys(store)[i] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock window.location
Object.defineProperty(globalThis, 'location', {
  value: { hostname: 'localhost', origin: 'http://localhost:5173', href: 'http://localhost:5173' },
  writable: true,
});

// Reset mocks between tests
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
