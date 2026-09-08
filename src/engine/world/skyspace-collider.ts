import * as THREE from "three"
import type {
  SkyspaceStructure,
  SupportId,
  StructuralTriangle,
} from "@/engine/world/skyspace-landmark"

export interface SweepHit {
  time: number
  normal: THREE.Vector3
  id: string
  penetration?: number
}
export interface SupportContact {
  point: THREE.Vector3
  normal: THREE.Vector3
  id: Exclude<SupportId, "air">
  separation: number
}
export interface SurfaceCollider {
  sampleSupport(
    feet: THREE.Vector3,
    previousSupport: SupportId,
  ): SupportContact | null
  sweepCapsule(
    feet: THREE.Vector3,
    up: THREE.Vector3,
    displacement: THREE.Vector3,
    radius: number,
    height: number,
  ): SweepHit | null
  sweepCamera(
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
  ): SweepHit | null
  nearLandmark?(feet: THREE.Vector3): boolean
  containsFootprint(feet: THREE.Vector3): boolean
}
function finite(...vectors: THREE.Vector3[]) {
  if (
    vectors.some(
      (v) =>
        !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z),
    )
  )
    throw new Error("Invalid collision query")
}
/** Static local triangle storage, swept AABB broad phase and conservative
 * advancement of exact segment/triangle distance. Scratch is private per collider;
 * results are copied, and no triangle-loop allocations or scene traversal occur. */
export function createSkyspaceCollider(
  structure: SkyspaceStructure,
  center = new THREE.Vector3(),
  groundRadius = 5.03,
): SurfaceCollider & { dispose(): void } {
  finite(center)
  if (!Number.isFinite(groundRadius) || groundRadius <= 0 || groundRadius > 10)
    throw new Error("Invalid ground radius")
  const triangles = structure.triangles.slice()
  const localCenter = structure.toLocal(center)
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    delta = new THREE.Vector3(),
    axis = new THREE.Vector3()
  const p = new THREE.Vector3(),
    q = new THREE.Vector3(),
    closestP = new THREE.Vector3(),
    closestQ = new THREE.Vector3(),
    normal = new THREE.Vector3()
  const e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3(),
    r = new THREE.Vector3(),
    tmp = new THREE.Vector3()
  const triangle = new THREE.Triangle(),
    segment = new THREE.Line3(),
    ray = new THREE.Ray(),
    bounds = new THREE.Box3()
  const checkP = new THREE.Vector3(),
    checkQ = new THREE.Vector3()
  let distanceSq = Infinity,
    disposed = false
  function consider() {
    const d = p.distanceToSquared(q)
    if (d < distanceSq) {
      distanceSq = d
      closestP.copy(p)
      closestQ.copy(q)
    }
  }
  function edgeDistance(start: THREE.Vector3, end: THREE.Vector3) {
    e1.subVectors(b, a)
    e2.subVectors(end, start)
    r.subVectors(a, start)
    const aa = e1.lengthSq(),
      ee = e2.lengthSq(),
      f = e2.dot(r)
    let s = 0,
      t = 0
    if (aa <= 1e-14) t = THREE.MathUtils.clamp(f / ee, 0, 1)
    else {
      const c = e1.dot(r),
        bb = e1.dot(e2),
        denom = aa * ee - bb * bb
      s =
        denom > 1e-14
          ? THREE.MathUtils.clamp((bb * f - c * ee) / denom, 0, 1)
          : 0
      t = (bb * s + f) / ee
      if (t < 0) {
        t = 0
        s = THREE.MathUtils.clamp(-c / aa, 0, 1)
      } else if (t > 1) {
        t = 1
        s = THREE.MathUtils.clamp((bb - c) / aa, 0, 1)
      }
    }
    p.copy(a).addScaledVector(e1, s)
    q.copy(start).addScaledVector(e2, t)
    consider()
  }
  function triangleDistance(t: StructuralTriangle) {
    triangle.set(t.a, t.b, t.c)
    distanceSq = Infinity
    p.copy(a)
    triangle.closestPointToPoint(p, q)
    consider()
    p.copy(b)
    triangle.closestPointToPoint(p, q)
    consider()
    edgeDistance(t.a, t.b)
    edgeDistance(t.b, t.c)
    edgeDistance(t.c, t.a)
    tmp.subVectors(b, a)
    const length = tmp.length()
    if (length > 1e-12) {
      ray.set(a, tmp.divideScalar(length))
      if (
        ray.intersectTriangle(t.a, t.b, t.c, false, q) &&
        q.distanceToSquared(a) <= length * length
      ) {
        p.copy(q)
        consider()
      }
    }
    normal.subVectors(closestP, closestQ)
    if (normal.lengthSq() < 1e-16) {
      normal.copy(t.normal)
      if (normal.dot(delta) > 0) normal.negate()
    } else normal.normalize()
    return Math.sqrt(distanceSq)
  }
  function sphereDistance() {
    segment.set(a, b).closestPointToPoint(localCenter, true, p)
    normal.subVectors(p, localCenter).normalize()
    if (normal.lengthSq() === 0) normal.set(0, 1, 0)
    return p.distanceTo(localCenter) - groundRadius
  }
  function sweep(
    from: THREE.Vector3,
    up: THREE.Vector3,
    displacement: THREE.Vector3,
    radius: number,
    height: number,
  ): SweepHit | null {
    finite(from, up, displacement)
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      radius > 2 ||
      !Number.isFinite(height) ||
      height < radius * 2 ||
      height > 4 ||
      Math.abs(up.length() - 1) > 1e-5
    )
      throw new Error("Invalid collision dimensions")
    if (disposed) return null
    const start = structure.toLocal(from)
    axis.copy(up).transformDirection(structure.inverse)
    delta
      .copy(displacement)
      .applyMatrix3(new THREE.Matrix3().setFromMatrix4(structure.inverse))
    const base = start.clone().addScaledVector(axis, radius),
      top = start.clone().addScaledVector(axis, height - radius)
    bounds.makeEmpty().expandByPoint(base).expandByPoint(top)
    bounds
      .expandByPoint(checkP.copy(base).add(delta))
      .expandByPoint(checkQ.copy(top).add(delta))
      .expandByScalar(radius + 1e-7)
    const speed = delta.length()
    let earliest = 1 + 1e-8,
      result: SweepHit | null = null
    function test(t: StructuralTriangle | null) {
      if (t) {
        const da = t.normal.dot(checkP.copy(base).sub(t.a)),
          db = t.normal.dot(checkQ.copy(top).sub(t.a)),
          motion = t.normal.dot(delta)
        if (
          (Math.min(da, db) >= radius - 1e-7 && motion >= -1e-9) ||
          (Math.max(da, db) <= -radius + 1e-7 && motion <= 1e-9)
        )
          return
      }
      let time = 0
      for (let iteration = 0; iteration < 48; iteration++) {
        a.copy(base).addScaledVector(delta, time)
        b.copy(top).addScaledVector(delta, time)
        const gap = (t ? triangleDistance(t) : sphereDistance()) - radius
        if (gap <= 1e-7) {
          // Resting tangential contact must not block sliding or departure.
          if (delta.dot(normal) < -1e-9 || speed === 0) {
            earliest = time
            result = {
              time,
              normal: normal.clone().transformDirection(structure.matrix),
              id: t?.id ?? "planet",
              penetration: Math.max(0, -gap),
            }
          }
          return
        }
        const closing = -delta.dot(normal)
        if (closing < 1e-12) return
        time += gap / closing
        if (time > earliest || time > 1) return
      }
      // Conservative exhaustion: stop at the last proven clear time.
      if (time < earliest) {
        earliest = time
        result = {
          time,
          normal: normal.clone().transformDirection(structure.matrix),
          id: t?.id ?? "planet",
        }
      }
    }
    test(null)
    for (const t of triangles) if (bounds.intersectsBox(t.bounds)) test(t)
    return result
  }
  return {
    nearLandmark(feet) {
      const p = structure.toLocal(feet)
      return (
        Math.abs(p.x) < 2.1 && p.y > -3 && p.y < 4 && p.z > -2.3 && p.z < 4.1
      )
    },
    containsFootprint(feet) {
      const p = structure.toLocal(feet)
      return (
        p.y > -2 &&
        p.y < 3 &&
        ((Math.abs(p.x) <= 1.32 && p.z >= -1.52 && p.z <= 1.52) ||
          (Math.abs(p.x) <= 0.73 && p.z >= 1.52 && p.z <= 3.25))
      )
    },
    sampleSupport(feet, previousSupport) {
      finite(feet)
      if (disposed) return null
      const local = structure.toLocal(feet)
      const radial = feet.clone().sub(center).normalize()
      if (radial.lengthSq() === 0) radial.set(0, 1, 0)
      const contact: SupportContact = {
        point: center.clone().addScaledVector(radial, groundRadius),
        normal: radial,
        id: "planet",
        separation: feet.distanceTo(center) - groundRadius,
      }
      let selected: StructuralTriangle | undefined,
        selectedY = 0,
        selectedSeparation = 0,
        selectedRadius = groundRadius * groundRadius
      // Upward support planes are queried in the local chart. Never select a
      // floor above the feet beyond the .05 snap boundary, nor a roof.
      for (const t of triangles) {
        if (
          !t.support ||
          local.x < t.bounds.min.x - 1e-7 ||
          local.x > t.bounds.max.x + 1e-7 ||
          local.z < t.bounds.min.z - 1e-7 ||
          local.z > t.bounds.max.z + 1e-7
        )
          continue
        const y =
          t.a.y -
          (t.normal.x * (local.x - t.a.x) + t.normal.z * (local.z - t.a.z)) /
            t.normal.y
        p.set(local.x, y, local.z)
        if (!triangle.set(t.a, t.b, t.c).containsPoint(p)) continue
        const separation = (local.y - y) * t.normal.y
        if (separation < -0.05 - 1e-7) continue
        tmp.copy(p).sub(localCenter)
        const radius = tmp.lengthSq()
        if (t.normal.dot(tmp.normalize()) < Math.cos((55 * Math.PI) / 180))
          continue
        if (
          radius >= selectedRadius - 1e-7 ||
          (previousSupport === t.support && Math.abs(separation) < 0.05)
        ) {
          selected = t
          selectedY = y
          selectedSeparation = separation
          selectedRadius = radius
        }
      }
      if (selected)
        return {
          point: structure.toWorld(p.set(local.x, selectedY, local.z)),
          normal: selected.normal.clone().transformDirection(structure.matrix),
          id: selected.support!,
          separation: selectedSeparation,
        }
      return contact
    },
    sweepCapsule: sweep,
    sweepCamera(from, to, radius) {
      // A sphere is a zero-length capsule whose feet are below its center.
      const up = new THREE.Vector3(0, 1, 0)
      return sweep(
        from.clone().addScaledVector(up, -radius),
        up,
        to.clone().sub(from),
        radius,
        2 * radius,
      )
    },
    dispose() {
      disposed = true
      triangles.length = 0
    },
  }
}
