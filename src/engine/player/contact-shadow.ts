import * as THREE from "three"

/** Two small, original vertex-alpha ellipses supplement the bounded sun map.
 * No texture, render target, extra pass or per-frame geometry allocation. */
export function createContactShadow() {
  const geometry = new THREE.BufferGeometry()
  const positions: number[] = [],
    colors: number[] = []
  const ink = new THREE.Color(0x354637)
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8,
      b = ((i + 1) * Math.PI) / 8
    positions.push(
      0,
      0,
      0,
      Math.cos(b) * 0.12,
      0,
      Math.sin(b) * 0.18,
      Math.cos(a) * 0.12,
      0,
      Math.sin(a) * 0.18,
    )
    for (const alpha of [0.28, 0, 0]) colors.push(ink.r, ink.g, ink.b, alpha)
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4))
  geometry.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  const object = new THREE.Group()
  object.name = "Traveler contact shade"
  const feet = [
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  ]
  object.add(...feet)
  const axis = new THREE.Vector3(0, 1, 0)
  let disposed = false
  return {
    object,
    place(
      index: number,
      position: THREE.Vector3,
      normal: THREE.Vector3,
      height: number,
    ) {
      if (disposed) return
      const foot = feet[index]
      if (!foot) return
      foot.visible = height < 0.3
      foot.position.copy(position).addScaledVector(normal, 0.003)
      foot.quaternion.setFromUnitVectors(axis, normal)
      foot.scale.setScalar(1 + THREE.MathUtils.clamp(height, 0, 0.3))
    },
    dispose() {
      if (disposed) return
      disposed = true
      object.removeFromParent()
      object.clear()
      geometry.dispose()
      material.dispose()
    },
  }
}
