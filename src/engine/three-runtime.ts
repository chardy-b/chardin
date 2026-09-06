import * as THREE from "three"

import type {
  ControlIntent,
  ExperienceRuntime,
  TravelerState,
} from "@/engine/contracts"
import {
  createInitialPlayerState,
  stepPlayerMotor,
  type PlayerMotorConfig,
} from "@/engine/player/player-motor"
import {
  createThirdPersonCameraState,
  updateThirdPersonCamera,
} from "@/engine/camera/third-person-camera"
import { createFixedStepLoop } from "@/engine/core/fixed-step-loop"

const PLANET_RADIUS = 5

export function createThreeRuntime(
  canvas: HTMLCanvasElement,
  context: WebGL2RenderingContext,
): ExperienceRuntime {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xb9d9d4)
  scene.fog = new THREE.Fog(0xb9d9d4, 12, 27)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))

  scene.add(new THREE.HemisphereLight(0xf4f2d0, 0x315548, 2.5))
  const sun = new THREE.DirectionalLight(0xfff1b7, 3.3)
  sun.position.set(-5, 9, 7)
  scene.add(sun)

  const planetGeometry = new THREE.IcosahedronGeometry(PLANET_RADIUS, 5)
  const colors: number[] = []
  const color = new THREE.Color()
  const positions = planetGeometry.getAttribute("position")
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index) / PLANET_RADIUS
    color.setHSL(0.29 + y * 0.018, 0.35, 0.36 + y * 0.035)
    colors.push(color.r, color.g, color.b)
  }
  planetGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  )
  const planetMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.96,
  })
  const planet = new THREE.Mesh(planetGeometry, planetMaterial)
  scene.add(planet)

  const grassGeometry = new THREE.ConeGeometry(0.025, 0.32, 3)
  grassGeometry.translate(0, 0.16, 0)
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x78943e })
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, 190)
  const dummy = new THREE.Object3D()
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let index = 0; index < grass.count; index += 1) {
    const y = 1 - (index / (grass.count - 1)) * 2
    const radial = Math.sqrt(1 - y * y)
    const point = new THREE.Vector3(
      Math.cos(index * goldenAngle) * radial,
      y,
      Math.sin(index * goldenAngle) * radial,
    )
    if (point.y > 0.82 && Math.abs(point.x) < 0.35) {
      dummy.scale.setScalar(0)
    } else {
      dummy.scale.setScalar(0.7 + ((index * 17) % 9) / 15)
    }
    dummy.position.copy(point).multiplyScalar(PLANET_RADIUS + 0.015)
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), point)
    dummy.rotateY(index * 1.71)
    dummy.updateMatrix()
    grass.setMatrixAt(index, dummy.matrix)
  }
  grass.instanceMatrix.needsUpdate = true
  scene.add(grass)

  const traveler = new THREE.Group()
  const coatMaterial = new THREE.MeshStandardMaterial({ color: 0xe86f51 })
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xf0c696 })
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.65, 5),
    coatMaterial,
  )
  body.position.y = 0.36
  traveler.add(body)
  const head = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.17, 1),
    faceMaterial,
  )
  head.position.y = 0.78
  traveler.add(head)
  scene.add(traveler)

  const intent: ControlIntent = {
    forward: 0,
    turn: 0,
    run: false,
    jumpPressed: false,
  }
  const keys = new Set<string>()
  const motorConfig: PlayerMotorConfig = {
    planetCenter: new THREE.Vector3(),
    groundRadius: PLANET_RADIUS + 0.03,
    walkSpeed: 1.65,
    runSpeed: 3.3,
    turnSpeed: 1.9,
    jumpSpeed: 4.2,
    gravity: 9.8,
  }
  let travelerState: TravelerState = createInitialPlayerState(motorConfig)
  let cameraState = createThirdPersonCameraState(
    travelerState,
    motorConfig.planetCenter,
  )
  let disposed = false

  const updateIntent = () => {
    intent.forward =
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"))
    intent.turn =
      Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft"))
    intent.run = keys.has("ShiftLeft") || keys.has("ShiftRight")
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
        "Space",
      ].includes(event.code)
    ) {
      event.preventDefault()
      if (event.code === "Space" && !keys.has("Space")) {
        intent.jumpPressed = true
      }
      keys.add(event.code)
      updateIntent()
    }
  }
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code)
    updateIntent()
  }
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  const clearKeys = () => {
    keys.clear()
    intent.forward = 0
    intent.turn = 0
    intent.run = false
    intent.jumpPressed = false
  }
  window.addEventListener("blur", clearKeys)

  const resize = () => {
    const width = Math.max(canvas.clientWidth, 1)
    const height = Math.max(canvas.clientHeight, 1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  resize()

  const placeTravelerAndCamera = () => {
    const up = travelerState.position.clone().normalize()
    const right = new THREE.Vector3()
      .crossVectors(travelerState.forward, up)
      .normalize()
    const basis = new THREE.Matrix4().makeBasis(
      right,
      up,
      travelerState.forward.clone().negate(),
    )
    traveler.position.copy(travelerState.position)
    traveler.quaternion.setFromRotationMatrix(basis)
    cameraState = updateThirdPersonCamera(
      cameraState,
      travelerState,
      motorConfig.planetCenter,
    )
    camera.position.copy(cameraState.position)
    camera.up.copy(cameraState.up)
    camera.lookAt(cameraState.target)
  }

  const loop = createFixedStepLoop({
    fixedSeconds: 1 / 60,
    maxFrameSeconds: 0.1,
    maxSubSteps: 6,
    simulate(dt) {
      travelerState = stepPlayerMotor(travelerState, intent, motorConfig, dt)
      intent.jumpPressed = false
    },
    render() {
      placeTravelerAndCamera()
      renderer.render(scene, camera)
    },
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
  })
  placeTravelerAndCamera()
  renderer.render(scene, camera)

  return {
    start: () => loop.start(),
    pause: () => loop.pause(),
    resume: () => loop.resume(),
    dispose() {
      if (disposed) return
      disposed = true
      loop.dispose()
      resizeObserver.disconnect()
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", clearKeys)
      planetGeometry.dispose()
      planetMaterial.dispose()
      grassGeometry.dispose()
      grassMaterial.dispose()
      body.geometry.dispose()
      head.geometry.dispose()
      coatMaterial.dispose()
      faceMaterial.dispose()
      renderer.dispose()
    },
  }
}
