import * as THREE from "three"
import {
  landmarkDefinition,
  validateLandmarkDefinition,
} from "@/engine/assets/manifest"
import { createResourceScope } from "@/engine/core/resource-scope"
import {
  createLandmarkAnchor,
  type LandmarkAnchor,
} from "@/engine/world/landmark-anchor"
import type { Quality } from "@/engine/quality/quality-controller"

export type SupportId = "planet" | "ramp" | "floor" | "air"
export interface StructuralTriangle {
  a: THREE.Vector3
  b: THREE.Vector3
  c: THREE.Vector3
  normal: THREE.Vector3
  bounds: THREE.Box3
  id: string
  support?: "floor" | "ramp"
  material: number
  skirt: boolean
}
export function sphereHeight(x: number, z: number, radius = 5.03) {
  return Math.sqrt(radius * radius - x * x - z * z) - 5
}
export function rampHeight(x: number, z: number) {
  const t = THREE.MathUtils.clamp((z - 1.65) / 1.6, 0, 1),
    h = t * t * (3 - 2 * t)
  return (1 - h) * 0.12 + h * sphereHeight(x, z)
}
export function createSkyspaceStructure(
  anchor: LandmarkAnchor = createLandmarkAnchor(),
) {
  validateLandmarkDefinition(landmarkDefinition)
  const matrix = new THREE.Matrix4()
    .makeBasis(
      anchor.frame.right,
      anchor.frame.up,
      anchor.frame.forward.clone().negate(),
    )
    .setPosition(anchor.position)
  const inverse = matrix.clone().invert()
  const triangles: StructuralTriangle[] = []
  type Point = [number, number, number]
  function tri(
    a: Point,
    b: Point,
    c: Point,
    id: string,
    material = 0,
    support?: "floor" | "ramp",
    skirt = false,
  ) {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      cv = new THREE.Vector3(...c)
    const normal = bv.clone().sub(av).cross(cv.clone().sub(av)).normalize()
    triangles.push({
      a: av,
      b: bv,
      c: cv,
      normal,
      bounds: new THREE.Box3().setFromPoints([av, bv, cv]),
      id,
      material,
      support,
      skirt,
    })
  }
  function quad(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    id: string,
    material = 0,
    support?: "floor" | "ramp",
    skirt = false,
  ) {
    tri(a, b, c, id, material, support, skirt)
    tri(a, c, d, id, material, support, skirt)
  }
  function box(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    id: string,
    inner?: number,
  ) {
    const faces: Point[][] = [
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
      [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
    ]
    faces.forEach((p, i) =>
      quad(p[0]!, p[1]!, p[2]!, p[3]!, id, i === inner ? 1 : 0),
    )
  }
  box(-1.32, -1.2, 0.12, 2.23, -1.52, 1.52, "wall-left", 1)
  box(1.2, 1.32, 0.12, 2.23, -1.52, 1.52, "wall-right", 0)
  box(-1.2, 1.2, 0.12, 2.23, -1.52, -1.4, "wall-back", 2)
  box(-1.2, -0.65, 0.12, 2.23, 1.4, 1.52, "door-left", 3)
  box(0.65, 1.2, 0.12, 2.23, 1.4, 1.52, "door-right", 3)
  box(-0.65, 0.65, 1.87, 2.23, 1.4, 1.52, "lintel", 3)
  quad(
    [-1.2, 0.12, 1.4],
    [1.2, 0.12, 1.4],
    [1.2, 0.12, -1.4],
    [-1.2, 0.12, -1.4],
    "floor",
    2,
    "floor",
  )
  quad(
    [-0.65, 0.12, 1.65],
    [0.65, 0.12, 1.65],
    [0.65, 0.12, 1.4],
    [-0.65, 0.12, 1.4],
    "landing",
    2,
    "floor",
  )
  const outer = [
    [-1.32, -1.52],
    [1.32, -1.52],
    [1.32, 1.52],
    [-1.32, 1.52],
  ]
  const hole = landmarkDefinition.aperture
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4,
      a = outer[i]!,
      b = outer[j]!,
      c = hole[j]!,
      d = hole[i]!
    quad(
      [a[0]!, 2.35, a[1]!],
      [d[0]!, 2.35, d[1]!],
      [c[0]!, 2.35, c[1]!],
      [b[0]!, 2.35, b[1]!],
      "roof",
      0,
    )
    quad(
      [a[0]!, 2.23, a[1]!],
      [b[0]!, 2.23, b[1]!],
      [c[0]!, 2.23, c[1]!],
      [d[0]!, 2.23, d[1]!],
      "ceiling",
      1,
    )
    quad(
      [d[0]!, 2.23, d[1]!],
      [c[0]!, 2.23, c[1]!],
      [c[0]!, 2.35, c[1]!],
      [d[0]!, 2.35, d[1]!],
      "reveal",
      1,
    )
    quad(
      [a[0]!, 2.23, a[1]!],
      [a[0]!, 2.35, a[1]!],
      [b[0]!, 2.35, b[1]!],
      [b[0]!, 2.23, b[1]!],
      "roof-edge",
      0,
    )
  }
  for (let ix = 0; ix < 13; ix++)
    for (let iz = 0; iz < 16; iz++) {
      const x = -0.65 + ix * 0.1,
        z = 1.65 + iz * 0.1
      const p = (x: number, z: number): Point => [x, rampHeight(x, z), z]
      const a = p(x, z),
        b = p(x + 0.1, z),
        c = p(x + 0.1, z + 0.1),
        d = p(x, z + 0.1)
      const ac = new THREE.Vector3(...a).distanceToSquared(
          new THREE.Vector3(...c),
        ),
        bd = new THREE.Vector3(...b).distanceToSquared(new THREE.Vector3(...d))
      if (ac <= bd + 1e-12) {
        tri(a, c, b, "ramp", 2, "ramp")
        tri(a, d, c, "ramp", 2, "ramp")
      } else {
        tri(a, d, b, "ramp", 2, "ramp")
        tri(b, d, c, "ramp", 2, "ramp")
      }
    }
  // Closed foundation sides. Bottoms stay buried in all visual tiers; collision
  // uses invariant radius 4.80. Visual bottoms are sampled separately at loading.
  function skirt(a: Point, b: Point) {
    quad(
      a,
      b,
      [b[0], sphereHeight(b[0], b[2], 4.8), b[2]],
      [a[0], sphereHeight(a[0], a[2], 4.8), a[2]],
      "skirt",
      0,
      undefined,
      true,
    )
  }
  const outline: Point[] = [
    [-1.32, 0.12, -1.52],
    [1.32, 0.12, -1.52],
    [1.32, 0.12, 1.52],
    [0.65, 0.12, 1.52],
    [0.65, 0.12, 1.65],
  ]
  for (let i = 1; i <= 16; i++)
    outline.push([0.65, rampHeight(0.65, 1.65 + i * 0.1), 1.65 + i * 0.1])
  outline.push([-0.65, rampHeight(-0.65, 3.25), 3.25])
  for (let i = 15; i >= 0; i--)
    outline.push([-0.65, rampHeight(-0.65, 1.65 + i * 0.1), 1.65 + i * 0.1])
  outline.push([-0.65, 0.12, 1.52], [-1.32, 0.12, 1.52])
  for (let i = 0; i < outline.length; i++)
    skirt(outline[i]!, outline[(i + 1) % outline.length]!)
  const bottom = outline.map(
    (p) => new THREE.Vector3(p[0], sphereHeight(p[0], p[2], 4.8), p[2]),
  )
  for (const face of THREE.ShapeUtils.triangulateShape(
    outline.map((p) => new THREE.Vector2(p[0], p[2])),
    [],
  )) {
    const a = bottom[face[0]!]!,
      b = bottom[face[1]!]!,
      c = bottom[face[2]!]!
    tri(
      a.toArray() as Point,
      b.toArray() as Point,
      c.toArray() as Point,
      "foundation-bottom",
      0,
      undefined,
      true,
    )
  }
  // Contrasting narrow curbs are visual only; capsule may jump off either side.
  const decoration: StructuralTriangle[] = []
  const structuralCount = triangles.length
  for (const sign of [-1, 1])
    for (let i = 0; i < 16; i++) {
      const x0 = sign > 0 ? 0.65 : -0.73,
        x1 = x0 + 0.08,
        z0 = 1.65 + i * 0.1,
        z1 = z0 + 0.1
      for (const x of [x0, x1])
        quad(
          [x, rampHeight(x, z0), z0],
          [x, rampHeight(x, z1), z1],
          [x, rampHeight(x, z1) + 0.1, z1],
          [x, rampHeight(x, z0) + 0.1, z0],
          "edge-strip",
          3,
        )
      quad(
        [x0, rampHeight(x0, z0) + 0.1, z0],
        [x0, rampHeight(x0, z1) + 0.1, z1],
        [x1, rampHeight(x1, z1) + 0.1, z1],
        [x1, rampHeight(x1, z0) + 0.1, z0],
        "edge-strip",
        3,
      )
    }
  quad(
    [-0.25, 0.121, 0.7],
    [0.25, 0.121, 0.7],
    [0.25, 0.121, 0.3],
    [-0.25, 0.121, 0.3],
    "view-inset",
    3,
  )
  decoration.push(...triangles.splice(structuralCount))
  return {
    matrix,
    inverse,
    triangles,
    decoration,
    toWorld: (p: THREE.Vector3) => p.clone().applyMatrix4(matrix),
    toLocal: (p: THREE.Vector3) => p.clone().applyMatrix4(inverse),
  }
}
export type SkyspaceStructure = ReturnType<typeof createSkyspaceStructure>

export function createSkyspaceLandmark(
  gradientMap: THREE.Texture | null,
  surfaceAt: (
    quality: Quality,
    direction: THREE.Vector3,
  ) => { position: THREE.Vector3 },
  definition: unknown = landmarkDefinition,
) {
  const scope = createResourceScope()
  try {
    validateLandmarkDefinition(definition)
    const structure = createSkyspaceStructure()
    const object = new THREE.Group()
    object.name = "Original skyspace pavilion"
    object.matrix.copy(structure.matrix)
    object.matrixAutoUpdate = false
    const shell = new THREE.MeshToonMaterial({
      color: "#B8B1A0",
      gradientMap,
      vertexColors: true,
    })
    scope.defer(() => shell.dispose())
    const wall = new THREE.MeshBasicMaterial({ color: "#ADA89C" })
    scope.defer(() => wall.dispose())
    const floor = new THREE.MeshToonMaterial({
      color: "#A49A83",
      gradientMap,
      vertexColors: true,
    })
    scope.defer(() => floor.dispose())
    const edge = new THREE.MeshToonMaterial({
      color: "#C8C0AC",
      gradientMap,
      vertexColors: true,
    })
    scope.defer(() => edge.dispose())
    const geometry = new THREE.BufferGeometry()
    scope.defer(() => geometry.dispose())
    const positions: number[] = [],
      normals: number[] = [],
      colors: number[] = [],
      indices: number[] = []
    const triangles = [...structure.triangles, ...structure.decoration]
    const skirtBottoms: number[] = []
    for (let material = 0; material < 4; material++) {
      const start = indices.length
      for (const t of triangles.filter((t) => t.material === material))
        for (const p of [t.a, t.b, t.c]) {
          if (t.skirt && Math.abs(p.y - sphereHeight(p.x, p.z, 4.8)) < 1e-8)
            skirtBottoms.push(positions.length / 3)
          indices.push(positions.length / 3)
          positions.push(...p.toArray())
          normals.push(...t.normal.toArray())
          // Quiet continuous pigment reinforces the base and wall thickness.
          // Interior score material remains independently controlled.
          const base = THREE.MathUtils.lerp(
            0.86,
            1,
            THREE.MathUtils.smoothstep(p.y, 0.12, 1.4),
          )
          const ramp =
            t.id === "ramp" ? THREE.MathUtils.smoothstep(p.z, 2.6, 3.25) : 0
          const value =
            material === 0 ? base * (t.id === "roof-edge" ? 0.9 : 1) : 1
          colors.push(
            value * (1 - ramp * 0.18),
            value * (1 - ramp * 0.12),
            value * (1 - ramp * 0.21),
          )
        }
      geometry.addGroup(start, indices.length - start, material)
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    )
    const variants = new Map<Quality, Float32Array>()
    for (const quality of ["low", "balanced", "high"] as const) {
      const values = new Float32Array(positions)
      for (const index of skirtBottoms) {
        const local = new THREE.Vector3().fromArray(values, index * 3)
        // Solve the vertical terrain intersection in this chart using the
        // prebuilt convex Planet sampler only, then bury the skirt by .05.
        for (let iteration = 0; iteration < 12; iteration++) {
          const direction = structure.toWorld(local).normalize()
          const radius = surfaceAt(quality, direction).position.length()
          local.y = sphereHeight(local.x, local.z, radius)
        }
        values[index * 3 + 1] = local.y - 0.05
      }
      variants.set(quality, values)
    }
    const positionAttribute = new THREE.BufferAttribute(
      variants.get("low")!.slice(),
      3,
    )
    geometry.setAttribute("position", positionAttribute)
    geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(geometry, [shell, wall, floor, edge])
    mesh.castShadow = true
    mesh.receiveShadow = true
    object.add(mesh)
    scope.defer(() => {
      object.removeFromParent()
      object.clear()
      variants.clear()
      structure.triangles.length = 0
      structure.decoration.length = 0
    })
    return {
      object,
      structure,
      triangleCount: indices.length / 3,
      applyWall: (color: number[]) => wall.color.fromArray(color),
      setQuality: (quality: Quality) => {
        positionAttribute.array.set(variants.get(quality)!)
        positionAttribute.needsUpdate = true
        geometry.computeBoundingSphere()
      },
      dispose: scope.dispose,
    }
  } catch (error) {
    scope.dispose()
    throw error
  }
}
