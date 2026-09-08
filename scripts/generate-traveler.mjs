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

// Original ring sections, dimensions and gait keys. No imported creative input.
const palette = Object.fromEntries(
  Object.entries({
    coat: 0xa75e48,
    linen: 0xd6c7a0,
    leather: 0x51473f,
    trouser: 0x454e5b,
    hair: 0x43382f,
    skin: 0xbc8967,
    sole: 0x343934,
    seam: 0x854c3c,
  }).map(([name, color]) => [
    name,
    new THREE.MeshStandardMaterial({
      name,
      color,
      roughness: 1,
      metalness: 0,
    }),
  ]),
)
const root = new THREE.Group()
root.name = "Traveler"
root.userData.authoring = {
  version: 3,
  forward: "-Z",
  units: "world units",
  walk: { duration: 0.8, speed: 1.65, stance: 0.5 },
  run: { duration: 0.52, speed: 3.3, stance: 0.34 },
  keys: "contact, compression, passing, toe-off, airborne, reach",
  source: "scripts/generate-traveler.mjs; first-principles original",
}
function group(name, position, parent = root) {
  const node = new THREE.Group()
  node.name = name
  node.position.set(...position)
  parent.add(node)
  return node
}
// Elliptical ring loft, chamfered by authored shoulder/hem/crown sections.
function loft(rings, sides = 8) {
  const positions = [],
    indices = []
  for (const [y, rx, rz, z = 0, x = 0] of rings)
    for (let i = 0; i < sides; i++) {
      const a = (2 * Math.PI * i) / sides
      positions.push(Math.cos(a) * rx + x, y, Math.sin(a) * rz + z)
    }
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < sides; i++) {
      const a = r * sides + i,
        b = r * sides + ((i + 1) % sides)
      indices.push(a, a + sides, b, b, a + sides, b + sides)
    }
  for (let i = 1; i < sides - 1; i++) {
    indices.push(0, i, i + 1)
    const top = (rings.length - 1) * sides
    indices.push(top, top + i + 1, top + i)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
function mesh(name, rings, mat, parent, position = [0, 0, 0], sides = 8) {
  const node = new THREE.Mesh(loft(rings, sides), palette[mat])
  node.name = name
  node.position.set(...position)
  parent.add(node)
  return node
}
const torso = group("Torso", [0, 0.62, 0])
mesh(
  "Coat",
  [
    [-0.12, 0.205, 0.13, 0.025],
    [-0.07, 0.225, 0.145, 0.015],
    [0.1, 0.155, 0.105],
    [0.23, 0.205, 0.12, -0.012],
    [0.28, 0.115, 0.095],
  ],
  "coat",
  torso,
)
mesh(
  "CoatPlacket",
  [
    [-0.11, 0.018, 0.008],
    [0.24, 0.014, 0.008],
  ],
  "seam",
  torso,
  [0, 0, -0.145],
  4,
)
const head = group("Head", [0, 0.39, -0.015], torso)
mesh(
  "Face",
  [
    [-0.085, 0.058, 0.06, -0.018],
    [-0.035, 0.103, 0.095, -0.012],
    [0.055, 0.122, 0.105],
    [0.12, 0.086, 0.075, 0.012],
  ],
  "skin",
  head,
)
mesh(
  "Hair",
  [
    [-0.025, 0.077, 0.05, 0.068],
    [0.055, 0.124, 0.101, 0.018],
    [0.13, 0.102, 0.085, 0.014, -0.024],
    [0.165, 0.033, 0.043, 0, -0.045],
  ],
  "hair",
  head,
)
mesh(
  "HairSweep",
  [
    [0.045, 0.028, 0.038],
    [0.09, 0.065, 0.052, 0, -0.025],
    [0.145, 0.072, 0.044, 0.015, -0.045],
  ],
  "hair",
  head,
  [0.07, 0, -0.067],
  6,
)
mesh(
  "Nose",
  [
    [-0.03, 0.023, 0.019],
    [0, 0.024, 0.044, -0.013],
    [0.035, 0.018, 0.012],
  ],
  "skin",
  head,
  [0, 0, -0.101],
  5,
)
mesh(
  "ScarfCollar",
  [
    [0.265, 0.123, 0.105],
    [0.32, 0.135, 0.115],
  ],
  "linen",
  torso,
)
const scarf = group("Scarf", [0.08, 0.28, 0.09], torso)
mesh(
  "ScarfTail",
  [
    [-0.19, 0.038, 0.012, 0.055],
    [-0.07, 0.045, 0.014, 0.04],
    [0, 0.04, 0.014],
  ],
  "linen",
  scarf,
  [0, 0, 0],
  4,
)
const pack = group("Pack", [-0.02, 0.065, 0.145], torso)
mesh(
  "PackBody",
  [
    [-0.145, 0.055, 0.032, 0, 0.02],
    [-0.07, 0.115, 0.053],
    [0.115, 0.106, 0.051],
    [0.155, 0.072, 0.035, 0, -0.02],
  ],
  "leather",
  pack,
)
mesh(
  "PackFlap",
  [
    [0.075, 0.07, 0.015, 0, 0.012],
    [0.14, 0.108, 0.022],
    [0.165, 0.072, 0.017, 0, -0.02],
  ],
  "linen",
  pack,
  [0, 0, 0.055],
)
for (const sign of [-1, 1]) {
  mesh(
    `Strap${sign}`,
    [
      [-0.08, 0.019, 0.012],
      [0.23, 0.019, 0.012],
    ],
    "linen",
    torso,
    [sign * 0.125, 0, 0.117],
    4,
  )
}
const L = 0.33
for (const [side, sign] of [
  ["Left", -1],
  ["Right", 1],
]) {
  const leg = group(`${side}Leg`, [sign * 0.125, 0.62, 0])
  mesh(
    `${side}Trouser`,
    [
      [-L, 0.055, 0.052],
      [-0.05, 0.065, 0.06],
      [0, 0.07, 0.065],
    ],
    "trouser",
    leg,
  )
  const knee = group(`${side}Knee`, [0, -L, 0], leg)
  mesh(
    `${side}Shin`,
    [
      [-L + 0.04, 0.048, 0.046],
      [0, 0.054, 0.052],
    ],
    "trouser",
    knee,
  )
  const ankle = group(`${side}Ankle`, [0, -L, 0], knee)
  mesh(
    `${side}Boot`,
    [
      [-0.08, 0.071, 0.115, -0.035],
      [-0.05, 0.075, 0.12, -0.04],
      [0.015, 0.062, 0.095, -0.035],
      [0.06, 0.05, 0.047],
    ],
    "sole",
    ankle,
  )
  const arm = group(`${side}Arm`, [sign * 0.205, 0.22, 0], torso)
  mesh(
    `${side}Sleeve`,
    [
      [-0.2, 0.043, 0.043],
      [-0.065, 0.061, 0.052],
      [0.02, 0.06, 0.055],
    ],
    "coat",
    arm,
  )
  const elbow = group(`${side}Elbow`, [0, -0.2, 0], arm)
  mesh(
    `${side}Cuff`,
    [
      [-0.16, 0.035, 0.039],
      [0, 0.045, 0.043],
    ],
    "coat",
    elbow,
  )
  mesh(
    `${side}Hand`,
    [
      [-0.055, 0.026, 0.03],
      [0, 0.043, 0.04],
      [0.035, 0.032, 0.035],
    ],
    "skin",
    elbow,
    [0, -0.18, 0],
  )
}
const quat = (angle, yaw = 0, roll = 0) =>
  new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(angle, yaw, roll, "YXZ"))
    .toArray()
function makeClip(name, duration, sample) {
  const data = new Map(),
    times = []
  const samples = 64
  for (let i = 0; i <= samples; i++) {
    times.push((i * duration) / samples)
    for (const [track, value] of Object.entries(sample(i / samples))) {
      if (!data.has(track)) data.set(track, [])
      data.get(track).push(...value)
    }
  }
  return new THREE.AnimationClip(
    name,
    duration,
    [...data].map(([track, values]) =>
      track.endsWith("quaternion")
        ? new THREE.QuaternionKeyframeTrack(track, times, values)
        : new THREE.VectorKeyframeTrack(track, times, values),
    ),
  )
}
function pose(phase, speed, duration, stance, jump = false) {
  const moving = speed > 0
  const cycle = Math.sin(phase * Math.PI * 2)
  const hip =
    0.62 +
    (moving
      ? Math.cos(phase * Math.PI * 4) * 0.012
      : Math.sin(phase * Math.PI * 2) ** 2 * 0.002)
  const tracks = {
    "Torso.position": [0, hip, 0],
    "Torso.quaternion": quat(
      moving ? -0.045 - speed * 0.055 + cycle * 0.018 : 0,
      moving ? cycle * 0.055 : 0,
      moving ? cycle * 0.018 : 0,
    ),
    "Scarf.quaternion": quat(
      moving
        ? -0.12 - speed * 0.02 + Math.sin(phase * Math.PI * 2 - 0.5) * 0.055
        : 0,
    ),
    "Pack.quaternion": quat(
      moving ? 0.025 * Math.sin(phase * Math.PI * 4 - 0.4) : 0,
    ),
  }
  for (const [side, sign, shift] of [
    ["Left", -1, 0],
    ["Right", 1, 0.5],
  ]) {
    const p = (phase + shift) % 1
    const stride = speed * duration * stance
    let z = 0,
      lift = 0
    if (moving && p <= stance) z = -stride / 2 + speed * duration * p
    else if (moving) {
      const t = (p - stance) / (1 - stance)
      const smooth = t * t * (3 - 2 * t)
      z =
        stride / 2 -
        stride * smooth +
        speed * duration * (1 - stance) * (2 * t * t * t - 3 * t * t + t)
      lift = (speed > 2 ? 0.25 : 0.1) * Math.sin(Math.PI * t) ** 2
    }
    if (jump) {
      lift = 0.11 * Math.sin(Math.PI * phase) ** 2
      z = sign * 0.06 * Math.sin(Math.PI * phase)
    }
    const down = hip - (0.08 + lift)
    const bend = Math.acos(Math.min(1, Math.hypot(down, z) / (2 * L)))
    const thigh = Math.atan2(-z, down) + bend
    const knee = -bend * 2
    tracks[`${side}Leg.position`] = [sign * 0.125, hip, 0]
    tracks[`${side}Leg.quaternion`] = quat(thigh)
    tracks[`${side}Knee.quaternion`] = quat(knee)
    tracks[`${side}Ankle.quaternion`] = quat(-thigh - knee)
    tracks[`${side}Arm.quaternion`] = quat(
      jump
        ? -0.9 * Math.sin(Math.PI * phase)
        : moving
          ? -Math.sin((p + 0.08) * Math.PI * 2) * (speed > 2 ? 0.95 : 0.55)
          : 0.04,
      0,
      moving ? sign * 0.18 : 0,
    )
    tracks[`${side}Elbow.quaternion`] = quat(
      moving ? 0.25 + speed * 0.16 + 0.14 * Math.sin(p * Math.PI * 2) : 0.08,
    )
  }
  return tracks
}
const clips = [
  makeClip("Idle", 2, (p) => pose(p, 0, 2, 0.5)),
  makeClip("Walk", 0.8, (p) => pose(p, 1.65, 0.8, 0.5)),
  makeClip("Run", 0.52, (p) => pose(p, 3.3, 0.52, 0.34)),
  makeClip("Jump", 0.7, (p) => pose(p, 0, 0.7, 0.5, true)),
]
// Set the bind pose to the same supported idle key, including bent knees.
for (const [track, value] of Object.entries(pose(0, 0, 2, 0.5))) {
  const [name, property] = track.split(".")
  root.getObjectByName(name)[property].fromArray(value)
}
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
