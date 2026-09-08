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
  applyCameraLook,
  createThirdPersonCameraState,
  updateThirdPersonCamera,
} from "@/engine/camera/third-person-camera"
import { createFixedStepLoop } from "@/engine/core/fixed-step-loop"
import { GamepadInput } from "@/engine/input/gamepad-input"
import { InputManager } from "@/engine/input/input-manager"
import { KeyboardInput } from "@/engine/input/keyboard-input"
import { TouchInput } from "@/engine/input/touch-input"
import { createTravelerView } from "@/engine/player/traveler-view"
import { createGrass } from "@/engine/world/grass"
import { createLandmarkAnchor } from "@/engine/world/landmark-anchor"
import { PLANET_RADIUS, createPlanet } from "@/engine/world/planet"

export function createThreeRuntime(
  canvas: HTMLCanvasElement,
  context: WebGL2RenderingContext,
  options: {
    touchRoot?: HTMLElement | null
    onPauseRequested?: () => void
  } = {},
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

  const planet = createPlanet({ profile: "medium" })
  const grass = createGrass({ profile: "medium" })
  const landmarkAnchor = createLandmarkAnchor(
    new THREE.Vector3(),
    PLANET_RADIUS,
  )
  scene.userData.landmarkAnchor = landmarkAnchor
  scene.add(planet.mesh, grass.mesh)

  canvas.dataset.travelerModel = "loading"
  const travelerView = createTravelerView({
    onStatus: (status) => {
      canvas.dataset.travelerModel = status
    },
  })
  const traveler = travelerView.object
  scene.add(traveler)

  const input = new InputManager([
    new KeyboardInput(window),
    new GamepadInput(),
    ...(options.touchRoot ? [new TouchInput(options.touchRoot)] : []),
  ])
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
  let travelerDistance = 0
  canvas.dataset.travelerDistance = "0"
  let cameraState = createThirdPersonCameraState(
    travelerState,
    motorConfig.planetCenter,
  )
  let disposed = false
  let frameIntent: ControlIntent = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    run: false,
    jumpPressed: false,
    actionPressed: false,
    pausePressed: false,
  }
  let pendingEdges = {
    jumpPressed: false,
    actionPressed: false,
    pausePressed: false,
  }

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
    beforeFrame() {
      frameIntent = input.sample()
      pendingEdges.jumpPressed ||= frameIntent.jumpPressed
      pendingEdges.actionPressed ||= frameIntent.actionPressed
      pendingEdges.pausePressed ||= frameIntent.pausePressed
    },
    simulate(dt) {
      const intent: ControlIntent = { ...frameIntent, ...pendingEdges }
      if (intent.pausePressed) {
        pendingEdges = {
          jumpPressed: false,
          actionPressed: false,
          pausePressed: false,
        }
        input.pause()
        options.onPauseRequested?.()
        return
      }
      const previousPosition = travelerState.position
      travelerState = stepPlayerMotor(travelerState, intent, motorConfig, dt)
      travelerDistance += previousPosition.distanceTo(travelerState.position)
      travelerView.update(travelerState, dt)
      cameraState = applyCameraLook(cameraState, intent.look, dt)
      pendingEdges = {
        jumpPressed: false,
        actionPressed: false,
        pausePressed: false,
      }
    },
    render() {
      placeTravelerAndCamera()
      canvas.dataset.travelerDistance = travelerDistance.toFixed(4)
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
    pause: () => {
      input.pause()
      loop.pause()
    },
    resume: () => loop.resume(),
    dispose() {
      if (disposed) return
      disposed = true
      loop.dispose()
      resizeObserver.disconnect()
      input.dispose()
      planet.dispose()
      grass.dispose()
      travelerView.dispose()
      renderer.dispose()
    },
  }
}
