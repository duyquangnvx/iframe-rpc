/**
 * Tests for correlation ID generation
 */

import { beforeEach, describe, expect, it } from "vitest";
import { generateCorrelationId, resetCounter } from "../src/utils/correlation";

describe("generateCorrelationId", () => {
  beforeEach(() => {
    resetCounter();
  });

  it("should generate unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateCorrelationId());
    }
    expect(ids.size).toBe(1000);
  });

  it("should generate string IDs", () => {
    const id = generateCorrelationId();
    expect(typeof id).toBe("string");
  });

  it("should generate non-empty IDs", () => {
    const id = generateCorrelationId();
    expect(id.length).toBeGreaterThan(0);
  });

  it("should contain timestamp and counter components", () => {
    const id = generateCorrelationId();
    expect(id).toContain("-");
    const parts = id.split("-");
    expect(parts.length).toBe(2);
  });

  it("should increment counter for each call", () => {
    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();
    const id3 = generateCorrelationId();

    const counter1 = id1.split("-")[1] ?? "";
    const counter2 = id2.split("-")[1] ?? "";
    const counter3 = id3.split("-")[1] ?? "";

    // Counter should be incrementing (in base36)
    expect(Number.parseInt(counter1, 36)).toBeLessThan(Number.parseInt(counter2, 36));
    expect(Number.parseInt(counter2, 36)).toBeLessThan(Number.parseInt(counter3, 36));
  });
});

describe("resetCounter", () => {
  it("should reset the counter", () => {
    // Generate some IDs
    generateCorrelationId();
    generateCorrelationId();
    generateCorrelationId();

    // Reset
    resetCounter();

    // Next ID should have counter = 1
    const id = generateCorrelationId();
    const counter = id.split("-")[1] ?? "";
    expect(Number.parseInt(counter, 36)).toBe(1);
  });
});
