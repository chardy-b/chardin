import { mkdir, writeFile } from "node:fs/promises"
import * as THREE from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"

globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result
        this.onloadend?.()
      },
      (error) => this.onerror?.(error),
    )
  }
}

const material = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.93, flatShading: true })
const palette = {
  terracotta: material(0xa94f3d),
  linen: material(0xdac39d),
  ink: material(0x273335),
  skin: material(0xb97959),
}
const root = new THREE.Group()
root.name = "Traveler"
function mesh(name, geometry, mat, position, parent = root) {
  const value = new THREE.Mesh(geometry, mat)
  value.name = name
  value.position.set(...position)
  parent.add(value)
  return value
}
mesh(
  "Boots",
  new THREE.BoxGeometry(0.38, 0.14, 0.28),
  palette.ink,
  [0, 0.07, -0.035],
)
mesh(
  "Coat",
  new THREE.ConeGeometry(0.34, 0.72, 6),
  palette.terracotta,
  [0, 0.55, 0],
)
mesh(
  "Scarf",
  new THREE.TorusGeometry(0.19, 0.045, 4, 8),
  palette.linen,
  [0, 0.84, 0],
).rotation.x = Math.PI / 2
const pack = mesh(
  "Pack",
  new THREE.BoxGeometry(0.38, 0.45, 0.16),
  palette.ink,
  [0, 0.57, 0.25],
)
pack.rotation.x = -0.08
mesh(
  "PackFlap",
  new THREE.CylinderGeometry(0.19, 0.19, 0.17, 6, 1, false, 0, Math.PI),
  palette.linen,
  [0, 0.76, 0.25],
)
const head = mesh(
  "Head",
  new THREE.IcosahedronGeometry(0.19, 1),
  palette.skin,
  [0, 1.02, 0],
)
mesh(
  "Hair",
  new THREE.CylinderGeometry(0.18, 0.2, 0.12, 7),
  palette.ink,
  [0, 0.14, 0],
  head,
)
const hood = mesh(
  "Hood",
  new THREE.TorusGeometry(0.2, 0.055, 4, 7, Math.PI * 1.25),
  palette.terracotta,
  [0, 0.02, 0.02],
  head,
)
hood.rotation.z = -Math.PI * 0.62
function limb(side) {
  const sign = side === "Left" ? -1 : 1
  const arm = new THREE.Group()
  arm.name = `${side}Arm`
  arm.position.set(sign * 0.27, 0.75, 0)
  root.add(arm)
  mesh(
    `${side}Sleeve`,
    new THREE.CylinderGeometry(0.07, 0.06, 0.48, 5),
    palette.terracotta,
    [0, -0.22, 0],
    arm,
  )
  mesh(
    `${side}Hand`,
    new THREE.IcosahedronGeometry(0.075, 0),
    palette.skin,
    [0, -0.48, 0],
    arm,
  )
  const leg = new THREE.Group()
  leg.name = `${side}Leg`
  leg.position.set(sign * 0.13, 0.3, 0)
  root.add(leg)
  mesh(
    `${side}Trouser`,
    new THREE.CylinderGeometry(0.085, 0.07, 0.36, 5),
    palette.ink,
    [0, -0.16, 0],
    leg,
  )
}
limb("Left")
limb("Right")
const times = [0, 0.25, 0.5, 0.75, 1]
const axis = new THREE.Vector3(1, 0, 0)
const quats = (angles) =>
  angles.flatMap((angle) =>
    new THREE.Quaternion().setFromAxisAngle(axis, angle).toArray(),
  )
const rotation = (node, angles) =>
  new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, quats(angles))
function gait(name, amount) {
  return new THREE.AnimationClip(name, 1, [
    rotation("LeftArm", [0, amount, 0, -amount, 0]),
    rotation("RightArm", [0, -amount, 0, amount, 0]),
    rotation("LeftLeg", [0, -amount * 0.75, 0, amount * 0.75, 0]),
    rotation("RightLeg", [0, amount * 0.75, 0, -amount * 0.75, 0]),
    new THREE.VectorKeyframeTrack(
      "Traveler.position",
      times,
      [0, 0, 0, 0, 0.018, 0, 0, 0, 0, 0, 0.018, 0, 0, 0, 0],
    ),
  ])
}
const clips = [
  new THREE.AnimationClip("Idle", 2, [
    new THREE.VectorKeyframeTrack(
      "Head.position",
      [0, 1, 2],
      [0, 1.02, 0, 0, 1.035, 0, 0, 1.02, 0],
    ),
  ]),
  gait("Walk", 0.48),
  gait("Run", 0.82),
  new THREE.AnimationClip("Jump", 0.7, [
    new THREE.VectorKeyframeTrack(
      "Traveler.position",
      [0, 0.18, 0.42, 0.7],
      [0, 0, 0, 0, -0.06, 0, 0, 0.05, 0, 0, 0, 0],
    ),
    new THREE.QuaternionKeyframeTrack(
      "LeftArm.quaternion",
      [0, 0.28, 0.7],
      quats([0, -1.15, 0]),
    ),
    new THREE.QuaternionKeyframeTrack(
      "RightArm.quaternion",
      [0, 0.28, 0.7],
      quats([0, -1.15, 0]),
    ),
  ]),
]
const binary = await new GLTFExporter().parseAsync(root, {
  binary: true,
  animations: clips,
  trs: true,
  onlyVisible: true,
})
await mkdir(new URL("../public/models/", import.meta.url), { recursive: true })
await writeFile(
  new URL("../public/models/traveler.glb", import.meta.url),
  new Uint8Array(binary),
)
console.log(`Generated public/models/traveler.glb (${binary.byteLength} bytes)`)
