import { describe, expect, it } from "vitest";
import { FRAGMENT_SHADER_SOURCE, hexToRgb } from "./shaderBackground";

describe("shaderBackground", () => {
  it("converts hex colors into normalized rgb uniforms", () => {
    expect(hexToRgb("#0073b5")).toEqual([0, 115 / 255, 181 / 255]);
    expect(hexToRgb("#fff")).toEqual([1, 1, 1]);
  });

  it("keeps the WebGL shader first-party and palette driven", () => {
    expect(FRAGMENT_SHADER_SOURCE).toContain("uniform vec3 u_base;");
    expect(FRAGMENT_SHADER_SOURCE).toContain("uniform vec3 u_colorA;");
    expect(FRAGMENT_SHADER_SOURCE).toContain("uniform vec3 u_colorB;");
    expect(FRAGMENT_SHADER_SOURCE).toContain("uniform float u_time;");
    expect(FRAGMENT_SHADER_SOURCE).toContain("gl_FragColor");
  });
});
