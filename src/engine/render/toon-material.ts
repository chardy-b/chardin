import * as THREE from "three"

/** Original four-band diffuse ramp with a warm, readable unlit floor. */
export function createToonMaterial(
  options: THREE.MeshToonMaterialParameters & { continuous?: boolean } = {},
) {
  const { continuous = false, ...materialOptions } = options
  const ramp =
    options.gradientMap ??
    new THREE.DataTexture(
      new Uint8Array([72, 128, 188, 242]),
      4,
      1,
      THREE.RedFormat,
    )
  if (!options.gradientMap) {
    ramp.minFilter = ramp.magFilter = continuous
      ? THREE.LinearFilter
      : THREE.NearestFilter
    ramp.generateMipmaps = false
    ramp.needsUpdate = true
  }
  const material = new THREE.MeshToonMaterial({
    emissive: 0x596548,
    emissiveIntensity: 0.06,
    ...materialOptions,
    gradientMap: ramp,
  })
  if (!options.gradientMap)
    material.addEventListener("dispose", () => ramp.dispose())
  return material
}
