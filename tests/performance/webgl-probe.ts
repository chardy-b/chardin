export interface ProbeSnapshot {
  drawCalls: number
  triangles: number
  textureBytes: number
  peakTextureBytes: number
  unknownAllocations: number
}
declare global {
  interface Window {
    __CHARDIN_PROBE__: { resetFrame(): void; snapshot(): ProbeSnapshot }
  }
}

/** Injected only by the measurement browser, before any renderer allocation.
 * Counts logical texture storage, not driver VRAM, renderbuffers or overhead.
 * Self-contained because Playwright serializes this function into the page.
 */
export function installWebGLProbe() {
  let drawCalls = 0
  let triangles = 0
  let peakTextureBytes = 0
  let unknownAllocations = 0
  const textures = new Map<
    WebGLTexture,
    Map<string, { width: number; height: number; depth: number; bytes: number }>
  >()
  const liveBytes = () => {
    let bytes = 0
    for (const levels of textures.values())
      for (const size of levels.values())
        bytes += size.width * size.height * size.depth * size.bytes
    return bytes
  }
  window.__CHARDIN_PROBE__ = {
    resetFrame() {
      drawCalls = 0
      triangles = 0
    },
    snapshot: () => ({
      drawCalls,
      triangles,
      textureBytes: liveBytes(),
      peakTextureBytes,
      unknownAllocations,
    }),
  }
  const originalContext = HTMLCanvasElement.prototype.getContext
  const seen = new WeakSet<WebGL2RenderingContext>()
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...args: unknown[]
  ) {
    const context = Reflect.apply(originalContext, this, [type, ...args])
    if (type !== "webgl2" || !context || seen.has(context)) return context
    const gl = context as WebGL2RenderingContext
    seen.add(gl)
    const wrap = (name: string, observe: (args: number[]) => void) => {
      const target = gl as unknown as Record<
        string,
        (...args: number[]) => unknown
      >
      const original = target[name].bind(gl)
      target[name] = (...values) => {
        const result = original(...values)
        observe(values)
        return result
      }
    }
    const count = (mode: number, vertices: number, instances = 1) => {
      drawCalls++
      if (mode === gl.TRIANGLES)
        triangles += Math.floor(vertices / 3) * instances
      else if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN)
        triangles += Math.max(0, vertices - 2) * instances
    }
    wrap("drawArrays", ([mode, , countValue]) => count(mode, countValue))
    wrap("drawElements", ([mode, countValue]) => count(mode, countValue))
    wrap("drawArraysInstanced", ([mode, , countValue, instances]) =>
      count(mode, countValue, instances),
    )
    wrap("drawElementsInstanced", ([mode, countValue, , , instances]) =>
      count(mode, countValue, instances),
    )
    const sizedBytes = new Map<number, number>([
      [gl.R8, 1],
      [gl.RG8, 2],
      [gl.RGB8, 3],
      [gl.RGBA8, 4],
      [gl.SRGB8_ALPHA8, 4],
      [gl.R16F, 2],
      [gl.RG16F, 4],
      [gl.RGB16F, 6],
      [gl.RGBA16F, 8],
      [gl.R32F, 4],
      [gl.RG32F, 8],
      [gl.RGB32F, 12],
      [gl.RGBA32F, 16],
      [gl.DEPTH_COMPONENT16, 2],
      [gl.DEPTH_COMPONENT24, 4],
      [gl.DEPTH_COMPONENT32F, 4],
      [gl.DEPTH24_STENCIL8, 4],
      [gl.DEPTH32F_STENCIL8, 8],
    ])
    const formatBytes = (internal: number, format: number, type: number) => {
      const channels = new Map<number, number>([
        [gl.RED, 1],
        [gl.RG, 2],
        [gl.RGB, 3],
        [gl.RGBA, 4],
      ])
      const component =
        type === gl.UNSIGNED_BYTE
          ? 1
          : type === gl.HALF_FLOAT
            ? 2
            : type === gl.FLOAT
              ? 4
              : 0
      return (
        sizedBytes.get(internal) ??
        (internal === format ? (channels.get(format) ?? 0) * component : 0)
      )
    }
    const binding = (target: number) => {
      const parameter =
        target === gl.TEXTURE_2D
          ? gl.TEXTURE_BINDING_2D
          : target === gl.TEXTURE_3D
            ? gl.TEXTURE_BINDING_3D
            : target === gl.TEXTURE_2D_ARRAY
              ? gl.TEXTURE_BINDING_2D_ARRAY
              : gl.TEXTURE_BINDING_CUBE_MAP
      return gl.getParameter(parameter) as WebGLTexture | null
    }
    const allocate = (
      target: number,
      level: number,
      width: number,
      height: number,
      bytes: number | undefined,
      depth = 1,
    ) => {
      if (
        !bytes ||
        ![width, height, depth].every((n) => Number.isFinite(n) && n > 0)
      ) {
        unknownAllocations++
        return
      }
      const texture = binding(target)
      if (!texture) {
        unknownAllocations++
        return
      }
      const levels = textures.get(texture) ?? new Map()
      levels.set(`${target}:${level}`, { width, height, depth, bytes })
      textures.set(texture, levels)
      peakTextureBytes = Math.max(peakTextureBytes, liveBytes())
    }
    wrap("texStorage2D", ([target, levels, format, width, height]) => {
      const faces =
        target === gl.TEXTURE_CUBE_MAP
          ? Array.from(
              { length: 6 },
              (_, i) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
            )
          : [target]
      for (const face of faces)
        for (let i = 0; i < levels; i++)
          allocate(
            face,
            i,
            Math.max(1, width >> i),
            Math.max(1, height >> i),
            sizedBytes.get(format),
          )
    })
    wrap("texStorage3D", ([target, levels, format, width, height, depth]) => {
      for (let i = 0; i < levels; i++)
        allocate(
          target,
          i,
          Math.max(1, width >> i),
          Math.max(1, height >> i),
          sizedBytes.get(format),
          target === gl.TEXTURE_3D ? Math.max(1, depth >> i) : depth,
        )
    })
    wrap(
      "texImage3D",
      ([target, level, internal, width, height, depth, , format, type]) =>
        allocate(
          target,
          level,
          width,
          height,
          formatBytes(internal, format, type),
          depth,
        ),
    )
    const texImage = gl.texImage2D.bind(gl)
    gl.texImage2D = ((...values: unknown[]) => {
      Reflect.apply(texImage, gl, values)
      const [target, level, internal] = values as number[]
      const source = values[5] as { width?: number; height?: number }
      const width = values.length === 6 ? source?.width : values[3]
      const height = values.length === 6 ? source?.height : values[4]
      const format = values[values.length === 6 ? 3 : 6] as number
      const type = values[values.length === 6 ? 4 : 7]
      allocate(
        target,
        level,
        Number(width),
        Number(height),
        formatBytes(internal, format, Number(type)),
      )
    }) as typeof gl.texImage2D
    const remove = gl.deleteTexture.bind(gl)
    gl.deleteTexture = (texture) => {
      remove(texture)
      if (texture) textures.delete(texture)
    }
    wrap("generateMipmap", ([target]) => {
      const texture = binding(target)
      const levels = texture && textures.get(texture)
      if (!levels) {
        unknownAllocations++
        return
      }
      for (const [key, size] of [...levels]) {
        if (!key.endsWith(":0")) continue
        let { width, height, depth } = size
        let level = 0
        while (
          width > 1 ||
          height > 1 ||
          (target === gl.TEXTURE_3D && depth > 1)
        ) {
          width = Math.max(1, width >> 1)
          height = Math.max(1, height >> 1)
          if (target === gl.TEXTURE_3D) depth = Math.max(1, depth >> 1)
          allocate(
            Number(key.split(":")[0]),
            ++level,
            width,
            height,
            size.bytes,
            depth,
          )
        }
      }
    })
    for (const name of [
      "compressedTexImage2D",
      "compressedTexImage3D",
      "copyTexImage2D",
    ])
      wrap(name, () => {
        unknownAllocations++
      })
    return context
  } as typeof HTMLCanvasElement.prototype.getContext
}
