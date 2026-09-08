import * as THREE from "three"
import type { TravelerState } from "@/engine/contracts"
import type { ThirdPersonCameraState } from "@/engine/camera/third-person-camera"
import type { SurfaceCollider } from "@/engine/world/skyspace-collider"

/** Reusable presentation storage. It never writes simulation state or decides
 * support ownership. Sphere interpolation preserves radius instead of cutting
 * a chord below the ground. Contact projection only follows the owned surface. */
export function createPresentation() {
  const position = new THREE.Vector3(),
    up = new THREE.Vector3(),
    forward = new THREE.Vector3()
  const offset = new THREE.Vector3(),
    right = new THREE.Vector3(),
    back = new THREE.Vector3()
  const basis = new THREE.Matrix4(),
    rotation = new THREE.Quaternion()
  const cameraPosition = new THREE.Vector3(),
    cameraTarget = new THREE.Vector3(),
    cameraUp = new THREE.Vector3()
  const clamp = (alpha: number) =>
    Number.isFinite(alpha) ? THREE.MathUtils.clamp(alpha, 0, 1) : 1
  return {
    position,
    up,
    forward,
    rotation,
    cameraPosition,
    cameraTarget,
    cameraUp,
    traveler(
      previous: TravelerState,
      current: TravelerState,
      alpha: number,
      center: THREE.Vector3,
      collider?: SurfaceCollider,
    ) {
      const t =
        previous.position.equals(current.position) &&
        previous.forward.equals(current.forward) &&
        previous.supportUp.equals(current.supportUp)
          ? 1
          : clamp(alpha)
      position.lerpVectors(previous.position, current.position, t)
      up.lerpVectors(previous.supportUp, current.supportUp, t).normalize()
      forward
        .lerpVectors(previous.forward, current.forward, t)
        .addScaledVector(up, -forward.dot(up))
        .normalize()
      if (previous.supportId === "planet" && current.supportId === "planet") {
        const previousRadius = previous.position.distanceTo(center)
        const radius =
          previousRadius +
          (current.position.distanceTo(center) - previousRadius) * t
        position.sub(center).normalize().multiplyScalar(radius).add(center)
      } else if (
        previous.grounded &&
        current.grounded &&
        t > 0 &&
        t < 1 &&
        collider
      ) {
        const contact = collider.sampleSupport(position, current.supportId)
        if (contact && Math.abs(contact.separation) < 0.02)
          position.addScaledVector(contact.normal, -contact.separation)
      }
      right.crossVectors(forward, up).normalize()
      back.copy(forward).negate()
      basis.makeBasis(right, up, back)
      rotation.setFromRotationMatrix(basis)
    },
    camera(
      previous: ThirdPersonCameraState,
      current: ThirdPersonCameraState,
      alpha: number,
      collider?: SurfaceCollider,
    ) {
      const t = previous.mode === current.mode ? clamp(alpha) : 1
      cameraPosition.lerpVectors(previous.position, current.position, t)
      cameraTarget.lerpVectors(previous.target, current.target, t)
      cameraUp.lerpVectors(previous.up, current.up, t).normalize()
      if (collider) {
        const hit = collider.sweepCamera(cameraTarget, cameraPosition, 0.12)
        if (hit) {
          offset.subVectors(cameraPosition, cameraTarget)
          cameraPosition
            .copy(cameraTarget)
            .addScaledVector(
              offset,
              Math.max(0, hit.time - 0.02 / Math.max(offset.length(), 1e-9)),
            )
        }
        if (collider.sweepCamera(cameraPosition, cameraPosition, 0.12)) {
          cameraPosition.copy(current.position)
          cameraTarget.copy(current.target)
          cameraUp.copy(current.up)
        }
      }
    },
  }
}
