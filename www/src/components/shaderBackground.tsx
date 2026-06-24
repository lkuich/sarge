import { useEffect, useRef } from "react";
import { SHADER_PALETTES, THEME_CHANGE_EVENT, type Theme } from "@/lib/theme";

type Rgb = [number, number, number];

export const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_colorA;
uniform vec3 u_colorB;

varying vec2 v_uv;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float softPlasma(vec2 point) {
  float waveA = sin(point.x * 4.3 + u_time * 0.35);
  float waveB = sin((point.x + point.y) * 3.1 - u_time * 0.28);
  float waveC = sin(length(point - vec2(0.72, 0.28)) * 8.2 + u_time * 0.42);
  return (waveA + waveB + waveC) / 3.0;
}

void main() {
  vec2 uv = v_uv;
  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 point = (uv - 0.5) * aspect;

  float plasma = softPlasma(point);
  float ribbon = smoothstep(0.18, 0.92, plasma * 0.5 + 0.5);
  float vignette = smoothstep(0.86, 0.12, distance(uv, vec2(0.50, 0.52)));
  float scan = sin((uv.y + uv.x * 0.18) * 30.0 + u_time * 0.5) * 0.018;
  float glowA = smoothstep(0.62, 0.0, distance(uv * vec2(1.25, 1.0), vec2(1.02, 0.10)));
  float glowB = smoothstep(0.56, 0.0, distance(uv * vec2(1.0, 1.15), vec2(0.04, 0.96)));
  float diagonal = smoothstep(0.22, 0.0, abs(point.y + point.x * 0.34 + plasma * 0.10));

  vec3 color = u_base * 0.92;
  color += u_colorA * (ribbon * 0.14 + glowA * 0.34 + diagonal * 0.10);
  color += u_colorB * ((1.0 - ribbon) * 0.10 + glowB * 0.24 + scan);
  color += vec3(0.020, 0.032, 0.050) * vignette;

  float grain = hash(floor(uv * u_resolution / 18.0)) - 0.5;
  float dither = (hash(floor(uv * u_resolution / 42.0)) - 0.5) * 0.010;
  color += grain * 0.010 + dither;
  color *= 0.82 + vignette * 0.30;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export function hexToRgb(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const number = Number.parseInt(expanded, 16);
  return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function getDocumentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export default function ShaderEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      stencil: false,
    });

    if (!gl) {
      document.body.classList.add("shader-failed");
      return () => document.body.classList.remove("shader-failed");
    }

    const program = createProgram(gl);
    const buffer = gl.createBuffer();
    if (!program || !buffer) {
      document.body.classList.add("shader-failed");
      return () => document.body.classList.remove("shader-failed");
    }

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const baseLocation = gl.getUniformLocation(program, "u_base");
    const colorALocation = gl.getUniformLocation(program, "u_colorA");
    const colorBLocation = gl.getUniformLocation(program, "u_colorB");

    if (
      positionLocation < 0 ||
      !resolutionLocation ||
      !timeLocation ||
      !baseLocation ||
      !colorALocation ||
      !colorBLocation
    ) {
      document.body.classList.add("shader-failed");
      return () => document.body.classList.remove("shader-failed");
    }

    document.body.classList.remove("shader-failed");

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const startedAt = performance.now();
    let animationFrame = 0;
    let disposed = false;

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
      gl.uniform2f(resolutionLocation, width, height);
    };

    const paint = (now: number) => {
      resize();

      const palette = SHADER_PALETTES[getDocumentTheme()];
      gl.uniform1f(timeLocation, reducedMotionQuery.matches ? 18 : (now - startedAt) / 1000);
      gl.uniform3fv(baseLocation, hexToRgb(palette.base));
      gl.uniform3fv(colorALocation, hexToRgb(palette.colorA));
      gl.uniform3fv(colorBLocation, hexToRgb(palette.colorB));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const tick = (now: number) => {
      if (disposed) return;
      paint(now);
      if (!reducedMotionQuery.matches) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    const restart = () => {
      window.cancelAnimationFrame(animationFrame);
      if (reducedMotionQuery.matches) {
        paint(performance.now());
        return;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };

    const observeTheme = new MutationObserver(() => paint(performance.now()));
    observeTheme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    window.addEventListener("resize", restart);
    window.addEventListener(THEME_CHANGE_EVENT, restart);
    reducedMotionQuery.addEventListener("change", restart);

    restart();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", restart);
      window.removeEventListener(THEME_CHANGE_EVENT, restart);
      reducedMotionQuery.removeEventListener("change", restart);
      observeTheme.disconnect();
      document.body.classList.remove("shader-failed");
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />;
}
