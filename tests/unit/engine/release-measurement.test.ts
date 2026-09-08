import { afterEach, expect, it, vi } from "vitest"
import { summarize } from "../../../scripts/lib/measurement.mjs"
import { requireExactHead } from "../../../scripts/lib/evidence.mjs"
import { installWebGLProbe } from "../../performance/webgl-probe"

afterEach(() => vi.unstubAllEnvs())
it("keeps stalls, uses nearest-rank percentiles and cannot pass missing budgets", () => {
  const values = [4, 1, 2, 3, 1000]
  expect(summarize(values, 16)).toMatchObject({
    samples: 5,
    median: 3,
    p95: 1000,
    p99: 1000,
    max: 1000,
    overBudget: 1,
    status: "fail",
  })
  expect(values).toEqual([4, 1, 2, 3, 1000])
  expect(summarize([16], 16).status).toBe("pass")
  expect(summarize([...Array(99).fill(1), 100], 16, "max").status).toBe("fail")
  expect(summarize([1], null)).toMatchObject({
    status: "budget-pending",
    overBudget: null,
  })
  for (const sample of [[], [NaN], [Infinity], [-1]])
    expect(() => summarize(sample, 16)).toThrow()
  expect(() => summarize([1], 0)).toThrow()
})
it("refuses dirty worktrees, missing PR head and stale head", () => {
  const head = "a".repeat(40)
  vi.stubEnv("CHARDIN_PR_HEAD", head)
  expect(() => requireExactHead({ head, dirty: false })).not.toThrow()
  expect(() => requireExactHead({ head, dirty: true })).toThrow()
  expect(() =>
    requireExactHead({ head: "b".repeat(40), dirty: false }),
  ).toThrow()
  vi.stubEnv("CHARDIN_PR_HEAD", "")
  expect(() => requireExactHead({ head, dirty: false })).toThrow()
})
it("counts all render passes and instancing, texture replacement, mipmaps and disposal", () => {
  const constants = [
    "TRIANGLES",
    "TRIANGLE_STRIP",
    "TRIANGLE_FAN",
    "TEXTURE_2D",
    "TEXTURE_3D",
    "TEXTURE_2D_ARRAY",
    "TEXTURE_BINDING_2D",
    "TEXTURE_BINDING_3D",
    "TEXTURE_BINDING_2D_ARRAY",
    "TEXTURE_BINDING_CUBE_MAP",
    "TEXTURE_CUBE_MAP",
    "TEXTURE_CUBE_MAP_POSITIVE_X",
    "R8",
    "RG8",
    "RGB8",
    "RGBA8",
    "SRGB8_ALPHA8",
    "R16F",
    "RG16F",
    "RGB16F",
    "RGBA16F",
    "R32F",
    "RG32F",
    "RGB32F",
    "RGBA32F",
    "DEPTH_COMPONENT16",
    "DEPTH_COMPONENT24",
    "DEPTH_COMPONENT32F",
    "DEPTH24_STENCIL8",
    "DEPTH32F_STENCIL8",
    "RED",
    "RG",
    "RGB",
    "RGBA",
    "UNSIGNED_BYTE",
    "HALF_FLOAT",
    "FLOAT",
  ]
  const gl = Object.fromEntries(
    constants.map((key, i) => [key, i + 1]),
  ) as unknown as WebGL2RenderingContext
  const texture = {} as WebGLTexture
  gl.getParameter = vi.fn(() => texture)
  for (const key of [
    "drawArrays",
    "drawElements",
    "drawArraysInstanced",
    "drawElementsInstanced",
    "texStorage2D",
    "texImage2D",
    "deleteTexture",
    "generateMipmap",
    "texImage3D",
    "texStorage3D",
    "compressedTexImage2D",
    "compressedTexImage3D",
    "copyTexImage2D",
  ])
    Object.assign(gl, { [key]: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl)
  installWebGLProbe()
  const canvas = document.createElement("canvas")
  canvas.getContext("webgl2")
  canvas.getContext("webgl2") // Do not wrap one context twice.
  gl.drawElements(gl.TRIANGLES, 12, 0, 0)
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 10)
  gl.drawElementsInstanced(gl.TRIANGLE_STRIP, 5, 0, 0, 2)
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
  expect(window.__CHARDIN_PROBE__.snapshot()).toMatchObject({
    drawCalls: 4,
    triangles: 32,
  })
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, 4, 4)
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(128)
  gl.generateMipmap(gl.TEXTURE_2D)
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(168)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    2,
    2,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  )
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(56)
  window.__CHARDIN_PROBE__.resetFrame()
  expect(window.__CHARDIN_PROBE__.snapshot()).toMatchObject({
    drawCalls: 0,
    triangles: 0,
    peakTextureBytes: 168,
    unknownAllocations: 0,
  })
  gl.deleteTexture(texture)
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(0)
  // Three.js initializes 3D/array placeholders with unsized RGBA.
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGBA,
    2,
    2,
    2,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  )
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(32)
  gl.generateMipmap(gl.TEXTURE_3D)
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(36)
  gl.deleteTexture(texture)
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 2, gl.RGBA8, 2, 2, 3)
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(60)
  gl.deleteTexture(texture)
  for (let face = 0; face < 6; face++)
    gl.texImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(24)
  gl.deleteTexture(texture)
  const source = document.createElement("canvas")
  source.width = 4
  source.height = 2
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  expect(window.__CHARDIN_PROBE__.snapshot().textureBytes).toBe(32)
  gl.deleteTexture(texture)
  gl.texStorage2D(gl.TEXTURE_2D, 1, -1, 4, 4)
  expect(window.__CHARDIN_PROBE__.snapshot().unknownAllocations).toBe(1)
})
