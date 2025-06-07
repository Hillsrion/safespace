import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// You can add other global setup files here, for example, mocking a global API
// import { server } from './mocks/server'; // Example for MSW
// beforeAll(() => server.listen());
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close());

// Example: Mocking matchMedia for components that might use it (e.g. for responsive design)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
