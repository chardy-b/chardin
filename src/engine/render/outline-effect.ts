import { Effect, EffectAttribute } from "postprocessing"
import { Texture, Uniform, Vector2 } from "three"
import { outlineFragment } from "@/engine/render/shaders/outline"

export class ChardinOutlineEffect extends Effect {
  constructor(normals: Texture) {
    super("ChardinOutline", outlineFragment, {
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["normalMap", new Uniform(normals)],
        ["texel", new Uniform(new Vector2(1, 1))],
        ["depthStrength", new Uniform(0.34)],
        ["normalStrength", new Uniform(0.12)],
      ]),
    })
  }
  setSize(width: number, height: number) {
    this.uniforms
      .get("texel")!
      .value.set(1 / Math.max(1, width), 1 / Math.max(1, height))
  }
  /** Deterministic verification can isolate the two independently sampled signals. */
  setSignals(depth: boolean, normals: boolean) {
    this.uniforms.get("depthStrength")!.value = depth ? 0.34 : 0
    this.uniforms.get("normalStrength")!.value = normals ? 0.12 : 0
  }
  dispose() {
    // The normal texture is borrowed from NormalPass, whose owner disposes it.
    this.uniforms.delete("normalMap")
    super.dispose()
  }
}
