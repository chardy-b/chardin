import * as THREE from "three"

export type FootSurface = (
  point: THREE.Vector3,
  position: THREE.Vector3,
  normal: THREE.Vector3,
) => void

/** Presentation-only two-link IK. Fixed steps capture world stance anchors;
 * fractional draws only read/interpolate them. No root or motor mutation. */
export function createFootPlacement(root: THREE.Group) {
  const feet = ["Left", "Right"].flatMap((side) => {
    const hip = root.getObjectByName(`${side}Leg`)
    const knee = root.getObjectByName(`${side}Knee`)
    const ankle = root.getObjectByName(`${side}Ankle`)
    if (!hip || !knee || !ankle) return []
    return [
      {
        hip,
        knee,
        ankle,
        locked: false,
        initialized: false,
        previous: new THREE.Vector3(),
        current: new THREE.Vector3(),
        previousNormal: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        anchor: new THREE.Vector3(),
        anchorNormal: new THREE.Vector3(),
      },
    ]
  })
  const point = new THREE.Vector3(),
    local = new THREE.Vector3(),
    surface = new THREE.Vector3()
  const normal = new THREE.Vector3(),
    target = new THREE.Vector3(),
    direction = new THREE.Vector3()
  const bend = new THREE.Vector3(),
    kneePoint = new THREE.Vector3(),
    lower = new THREE.Vector3()
  const down = new THREE.Vector3(0, -1, 0),
    up = new THREE.Vector3(0, 1, 0)
  const parentRotation = new THREE.Quaternion(),
    inverseHip = new THREE.Quaternion(),
    sole = new THREE.Quaternion()
  let enabled = false
  return {
    capture(grounded: boolean, sample: FootSurface, reset = false) {
      enabled = grounded
      root.updateMatrixWorld(true)
      for (const foot of feet) {
        if (reset) {
          foot.locked = false
          foot.initialized = false
        }
        foot.previous.copy(foot.current)
        foot.previousNormal.copy(foot.normal)
        foot.ankle.getWorldPosition(point)
        root.worldToLocal(local.copy(point))
        sample(point, surface, normal)
        const stance = grounded && local.y < 0.09
        // Reach limits also release anchors on reversal, in-place turns and
        // blocking; an old support never drags a knee across the body.
        if (!stance || point.distanceTo(foot.anchor) > 0.18) foot.locked = false
        target.copy(surface).addScaledVector(normal, Math.max(0.08, local.y))
        if (stance && !foot.locked) {
          foot.anchor.copy(surface).addScaledVector(normal, 0.08)
          foot.anchorNormal.copy(normal)
          foot.locked = true
        }
        if (stance) {
          // Ease out of an overextended plant before its reach-limit release.
          const release = THREE.MathUtils.smoothstep(
            point.distanceTo(foot.anchor),
            0.1,
            0.18,
          )
          foot.current.copy(foot.anchor).lerp(target, release)
        } else foot.current.copy(target)
        foot.normal.copy(stance ? foot.anchorNormal : normal)
        if (!foot.initialized || !grounded) {
          foot.previous.copy(foot.current)
          foot.previousNormal.copy(foot.normal)
          foot.initialized = true
        }
      }
    },
    present(alpha: number) {
      if (!enabled) return
      const t = Number.isFinite(alpha) ? THREE.MathUtils.clamp(alpha, 0, 1) : 1
      root.updateMatrixWorld(true)
      for (const foot of feet) {
        target.lerpVectors(foot.previous, foot.current, t)
        const parent = foot.hip.parent!
        parent.worldToLocal(target)
        target.sub(foot.hip.position)
        const a = foot.knee.position.length(),
          b = foot.ankle.position.length()
        const distance = THREE.MathUtils.clamp(
          target.length(),
          0.05,
          a + b - 0.00001,
        )
        direction.copy(target).normalize()
        bend.set(0, 0, -1).addScaledVector(direction, direction.z).normalize()
        const along = (a * a - b * b + distance * distance) / (2 * distance)
        const height = Math.sqrt(Math.max(0, a * a - along * along))
        kneePoint
          .copy(direction)
          .multiplyScalar(along)
          .addScaledVector(bend, height)
        foot.hip.quaternion.setFromUnitVectors(
          down,
          lower.copy(kneePoint).normalize(),
        )
        inverseHip.copy(foot.hip.quaternion).invert()
        lower
          .copy(direction)
          .multiplyScalar(distance)
          .sub(kneePoint)
          .applyQuaternion(inverseHip)
          .normalize()
        foot.knee.quaternion.setFromUnitVectors(down, lower)
        parent.getWorldQuaternion(parentRotation).invert()
        normal
          .lerpVectors(foot.previousNormal, foot.normal, t)
          .normalize()
          .applyQuaternion(parentRotation)
        sole.setFromUnitVectors(up, normal)
        foot.ankle.quaternion
          .copy(foot.hip.quaternion)
          .multiply(foot.knee.quaternion)
          .invert()
          .multiply(sole)
      }
    },
    dispose() {
      feet.length = 0
      enabled = false
    },
  }
}
