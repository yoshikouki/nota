import { test, expect, describe } from "bun:test";
import { maskToken } from "./format";

describe("maskToken", () => {
  test("masks a typical Notion token", () => {
    expect(maskToken("secret_abc1234567xyz9876")).toBe("secret_abc…9876");
  });

  test("masks a short token without error", () => {
    expect(maskToken("abcdefghijklmn")).toBe("abcdefghij…klmn");
  });

  test("handles exact 14-char token (overlap boundary)", () => {
    expect(maskToken("12345678901234")).toBe("1234567890…1234");
  });
});
