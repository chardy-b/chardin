import * as THREE from "three"

/** Original four-band diffuse ramp with a warm, readable unlit floor. */
export function createToonMaterial(
  options: THREE.MeshToonMaterialParameters = {},
) {
  const ramp = new THREE.DataTexture(
    new Uint8Array([85, 135, 190, 245]),
    4,
    1,
    THREE.RedFormat,
  )
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter
  ramp.generateMipmaps = false
  ramp.needsUpdate = true
  const material = new THREE.MeshToonMaterial({
    gradientMap: ramp,
    emissive: 0x596548,
    emissiveIntensity: 0.22,
    ...options,
  })
  material.addEventListener("dispose", () => ramp.dispose())
  return material
}
