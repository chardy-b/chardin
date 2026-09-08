import * as THREE from "three"
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  NormalPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing"
import { createResourceScope } from "@/engine/core/resource-scope"
import { ChardinOutlineEffect } from "@/engine/render/outline-effect"
import {
  renderingSettings,
  type Quality,
} from "@/engine/quality/quality-controller"

export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  sun: THREE.DirectionalLight,
  initial: {
    quality: Quality
    reducedMotion: boolean
    deviceDpr: number
    width: number
    height: number
  } = {
    quality: "low",
    reducedMotion: false,
    deviceDpr: 1,
    width: 1,
    height: 1,
  },
) {
  const scope = createResourceScope()
  let disposed = false
  try {
    // Linear intermediate buffers; only the final EffectPass encodes sRGB.
    // ToneMappingEffect alone owns tone mapping.
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const configureRenderer = (
      settings: ReturnType<typeof renderingSettings>,
    ) => {
      renderer.setPixelRatio(settings.dpr * settings.postScale)
      if (sun.shadow.mapSize.x !== settings.shadowSize) {
        sun.shadow.map?.dispose()
        sun.shadow.map = null
        sun.shadow.mapSize.setScalar(settings.shadowSize)
        sun.shadow.needsUpdate = true
      }
    }
    const initialSettings = renderingSettings(
      initial.quality,
      initial.deviceDpr,
      initial.reducedMotion,
    )
    let width = Math.max(1, Math.floor(initial.width))
    let height = Math.max(1, Math.floor(initial.height))
    // Composer construction and pass initialization inspect the drawing buffer.
    // Bound it before either can create a render target, including after retry.
    configureRenderer(initialSettings)
    renderer.setSize(width, height, false)
    const hdr = Boolean(
      renderer.getContext().getExtension("EXT_color_buffer_float"),
    )
    const composer = new EffectComposer(renderer, {
      multisampling: 0,
      frameBufferType: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    })
    // Each pass owns its effects. Keep ownership local until addPass succeeds.
    scope.defer(() => composer.dispose())
    const add = <T extends RenderPass | NormalPass | EffectPass>(
      pass: T,
    ): T => {
      try {
        composer.addPass(pass)
        return pass
      } catch (error) {
        pass.dispose()
        throw error
      }
    }
    add(new RenderPass(scene, camera))
    const normals = add(new NormalPass(scene, camera))
    const outline = new ChardinOutlineEffect(normals.texture)
    add(new EffectPass(camera, outline))
    const bloom = add(
      new EffectPass(
        camera,
        new BloomEffect({
          intensity: 0.12,
          luminanceThreshold: 0.9,
          luminanceSmoothing: 0.2,
          mipmapBlur: true,
          levels: 4,
          radius: 0.55,
        }),
      ),
    )
    const tone = add(
      new EffectPass(
        camera,
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      ),
    )
    const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM })
    const aa = add(new EffectPass(camera, smaa))
    composer.autoRenderToScreen = false
    const configureEffects = (
      settings: ReturnType<typeof renderingSettings>,
    ) => {
      bloom.enabled = settings.bloom
      aa.enabled = settings.smaa
      aa.renderToScreen = settings.smaa
      tone.renderToScreen = !settings.smaa
    }
    configureEffects(initialSettings)
    // 6.39.4 dispatches load after both embedded lookup images; its declarations
    // currently only advertise the inherited change event.
    const smaaEvents = smaa as unknown as THREE.EventDispatcher<{
      load: object
    }>
    let timeout: ReturnType<typeof setTimeout> | undefined
    let resolveReady!: () => void
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      if (
        smaa.weightsMaterial.searchTexture &&
        smaa.weightsMaterial.areaTexture
      ) {
        resolve()
        return
      }
      const loaded = () => {
        clearTimeout(timeout)
        smaaEvents.removeEventListener("load", loaded)
        if (disposed) {
          smaa.weightsMaterial.searchTexture?.dispose()
          smaa.weightsMaterial.areaTexture?.dispose()
        }
        resolve()
      }
      smaaEvents.addEventListener("load", loaded)
      timeout = setTimeout(
        () => reject(new Error("Antialiasing resources unavailable")),
        10_000,
      )
    })
    scope.defer(() => {
      clearTimeout(timeout)
      resolveReady()
    })
    return {
      ready,
      configure(quality: Quality, reducedMotion: boolean, deviceDpr: number) {
        if (disposed) return
        const settings = renderingSettings(quality, deviceDpr, reducedMotion)
        // Both renderer and composer are bounded by profile DPR * target scale.
        configureRenderer(settings)
        configureEffects(settings)
        composer.setSize(width, height, false)
      },
      resize(nextWidth: number, nextHeight: number) {
        if (disposed) return
        width = Math.max(1, Math.floor(nextWidth))
        height = Math.max(1, Math.floor(nextHeight))
        composer.setSize(width, height, false)
      },
      render(seconds: number) {
        if (!disposed) composer.render(seconds)
      },
      setOutlineSignals: (depth: boolean, normal: boolean) =>
        outline.setSignals(depth, normal),
      dispose() {
        if (disposed) return
        disposed = true
        scope.dispose()
      },
    }
  } catch (error) {
    scope.dispose()
    throw error
  }
}
