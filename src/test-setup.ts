import "@testing-library/jest-dom/vitest";

// jsdom lacks the pointer-capture and scroll APIs Radix Select and the results table call.
for (const name of [
  "hasPointerCapture",
  "releasePointerCapture",
  "setPointerCapture",
  "scrollIntoView",
])
  if (!(name in Element.prototype))
    Object.defineProperty(Element.prototype, name, { value: () => false, writable: true });
