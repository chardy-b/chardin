import * as THREE from "three"
import type {
  ControlIntent,
  ExperienceRuntime,
  RuntimeOptions,
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
import { createResourceScope } from "@/engine/core/resource-scope"
import { deterministicMode, installTestApi } from "@/engine/debug/test-api"
import { GamepadInput } from "@/engine/input/gamepad-input"
import { InputManager } from "@/engine/input/input-manager"
import { KeyboardInput } from "@/engine/input/keyboard-input"
import { TouchInput } from "@/engine/input/touch-input"
import { createTravelerView } from "@/engine/player/traveler-view"
import {
  createQualityController,
  initialQuality,
  type Quality,
} from "@/engine/quality/quality-controller"
import { createRenderPipeline } from "@/engine/render/render-pipeline"
import { createContentProfiles } from "@/engine/world/content-profiles"
import { createLandmarkAnchor } from "@/engine/world/landmark-anchor"
import { PLANET_RADIUS } from "@/engine/world/planet"

const emptyIntent = (): ControlIntent => ({
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  run: false,
  jumpPressed: false,
  actionPressed: false,
  pausePressed: false,
})

export function createThreeRuntime(
  canvas: HTMLCanvasElement,
  context: WebGL2RenderingContext,
  options: RuntimeOptions = {},
): ExperienceRuntime {
  const scope = createResourceScope()
  let disposed = false
  let running = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    running = false
    scope.dispose()
  }
  try {
    const manual = deterministicMode()
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let reducedMotion = motion.matches
    const quality = createQualityController(
      options.quality ??
        (manual
          ? "balanced"
          : initialQuality({
              cores: navigator.hardwareConcurrency,
              memory: (navigator as Navigator & { deviceMemory?: number })
                .deviceMemory,
              coarse: window.matchMedia("(pointer: coarse)").matches,
            })),
    )
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xc3dcd7)
    scene.fog = new THREE.Fog(0xc3dcd7, 15, 35)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60)
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: false,
      alpha: false,
      powerPreference: "default",
    })
    scope.defer(() => renderer.dispose())
    // An ambient floor keeps the far hemisphere legible independently of world-up.
    scene.add(new THREE.AmbientLight(0xf3e9cd, 1.25))
    scene.add(new THREE.HemisphereLight(0xf4f2df, 0x85937a, 1.4))
    const sun = new THREE.DirectionalLight(0xffefc1, 2.4)
    sun.position.set(-5, 9, 7)
    sun.castShadow = true
    Object.assign(sun.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -7,
      near: 0.5,
      far: 30,
    })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.025
    scene.add(sun)
    scope.defer(() => sun.shadow.dispose())
    const contentStart = performance.now()
    const profiles = createContentProfiles()
    const startupContentMs = performance.now() - contentStart
    scope.defer(() => profiles.dispose())
    let content = profiles.get(quality.current())
    scene.add(content.planet.mesh, content.grass.mesh)
    scene.userData.landmarkAnchor = createLandmarkAnchor(
      new THREE.Vector3(),
      PLANET_RADIUS,
    )
    canvas.dataset.travelerModel = "loading"
    const travelerView = createTravelerView({
      onStatus: (status) => {
        if (!disposed) canvas.dataset.travelerModel = status
      },
    })
    scope.defer(() => travelerView.dispose())
    scene.add(travelerView.object)
    const adapters = []
    let inputOwnsAdapters = false
    const ownAdapter = <T extends KeyboardInput | GamepadInput | TouchInput>(
      adapter: T,
    ) => {
      scope.defer(() => {
        if (!inputOwnsAdapters) adapter.dispose()
      })
      return adapter
    }
    adapters.push(ownAdapter(new KeyboardInput(window)))
    adapters.push(ownAdapter(new GamepadInput()))
    if (options.touchRoot)
      adapters.push(ownAdapter(new TouchInput(options.touchRoot)))
    const input = new InputManager(adapters)
    inputOwnsAdapters = true
    scope.defer(() => input.dispose())
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
    let simulationTime = 0
    let environmentTime = 0
    let cameraState = createThirdPersonCameraState(
      travelerState,
      motorConfig.planetCenter,
    )
    let frameIntent = emptyIntent()
    let pendingEdges = {
      jumpPressed: false,
      actionPressed: false,
      pausePressed: false,
    }
    const clearPendingEdges = () => {
      pendingEdges = {
        jumpPressed: false,
        actionPressed: false,
        pausePressed: false,
      }
    }
    const pipeline = createRenderPipeline(renderer, scene, camera, sun, {
      quality: quality.current(),
      reducedMotion,
      deviceDpr: window.devicePixelRatio,
      width: Math.max(canvas.clientWidth, 1),
      height: Math.max(canvas.clientHeight, 1),
    })
    scope.defer(() => pipeline.dispose())
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
      travelerView.object.position.copy(travelerState.position)
      travelerView.object.quaternion.setFromRotationMatrix(basis)
      // Portrait reveals more of the curved horizon while keeping the Traveler central.
      const portrait = camera.aspect < 0.85
      cameraState = updateThirdPersonCamera(
        cameraState,
        travelerState,
        motorConfig.planetCenter,
        {
          height: portrait ? 2.65 : 2.25,
          distance: portrait ? 5.5 : 4.4,
          targetHeight: 0.65,
        },
      )
      camera.position.copy(cameraState.position)
      camera.up.copy(cameraState.up)
      camera.lookAt(cameraState.target)
    }
    const draw = () => {
      if (disposed) return
      placeTravelerAndCamera()
      canvas.dataset.travelerDistance = travelerDistance.toFixed(4)
      canvas.dataset.travelerGrounded = String(travelerState.grounded)
      pipeline.render(0)
    }
    const fail = () => {
      dispose()
      options.onFatal?.()
    }
    const guarded = (action: () => void) => {
      if (!disposed) {
        try {
          action()
        } catch {
          fail()
        }
      }
    }
    const applyQuality = (next: Quality) => {
      const nextContent = profiles.get(next)
      if (nextContent !== content) {
        scene.remove(content.planet.mesh, content.grass.mesh)
        content = nextContent
        scene.add(content.planet.mesh, content.grass.mesh)
      }
      pipeline.configure(next, reducedMotion, window.devicePixelRatio)
      canvas.dataset.quality = next
      options.onQuality?.(next)
    }
    let renderedViewport = { width: 0, height: 0 }
    const resize = () => {
      const width = Math.max(canvas.clientWidth, 1)
      const height = Math.max(canvas.clientHeight, 1)
      pipeline.resize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      draw()
      renderedViewport = { width, height }
    }
    let previousFrameTime = performance.now()
    const simulate = (dt: number) => {
      const intent = { ...frameIntent, ...pendingEdges }
      if (intent.pausePressed) {
        pause()
        options.onPauseRequested?.()
        return
      }
      const previousPosition = travelerState.position
      travelerState = stepPlayerMotor(travelerState, intent, motorConfig, dt)
      travelerDistance += previousPosition.distanceTo(travelerState.position)
      simulationTime += dt
      // No idle bob or automatic camera orbit; reduced motion freezes ambient drift
      // and idle animation, while movement, manual look and jumping stay available.
      travelerView.update(
        travelerState,
        reducedMotion && travelerState.locomotion === "idle" ? 0 : dt,
      )
      if (!reducedMotion && !manual) {
        environmentTime += dt
        sun.intensity = 2.4 + Math.sin(environmentTime * 0.06) * 0.08
      }
      cameraState = applyCameraLook(cameraState, intent.look, dt)
      clearPendingEdges()
    }
    const loop = createFixedStepLoop({
      fixedSeconds: 1 / 60,
      maxFrameSeconds: 0.1,
      maxSubSteps: 6,
      beforeFrame() {
        const now = performance.now()
        const current = quality.current()
        const next = quality.sample(now - previousFrameTime)
        previousFrameTime = now
        if (next !== current) applyQuality(next)
        frameIntent = input.sample()
        pendingEdges.jumpPressed ||= frameIntent.jumpPressed
        pendingEdges.actionPressed ||= frameIntent.actionPressed
        pendingEdges.pausePressed ||= frameIntent.pausePressed
      },
      simulate,
      render: draw,
      now: () => performance.now(),
      requestFrame: (callback) =>
        window.requestAnimationFrame((time) => guarded(() => callback(time))),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
    })
    scope.defer(() => loop.dispose())
    const pause = () => {
      if (disposed) return
      running = false
      clearPendingEdges()
      frameIntent = emptyIntent()
      input.pause()
      loop.pause()
    }
    const observer = new ResizeObserver(() => guarded(resize))
    scope.defer(() => observer.disconnect())
    observer.observe(canvas)
    const onMotion = () =>
      guarded(() => {
        reducedMotion = motion.matches
        canvas.dataset.reducedMotion = String(reducedMotion)
        applyQuality(quality.current())
        draw()
      })
    motion.addEventListener("change", onMotion)
    scope.defer(() => motion.removeEventListener("change", onMotion))
    canvas.dataset.reducedMotion = String(reducedMotion)
    applyQuality(quality.current())
    resize()
    const ready = Promise.all([travelerView.ready, pipeline.ready]).then(() => {
      if (disposed) return
      travelerView.object.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true
          object.receiveShadow = true
        }
      })
      travelerView.update(travelerState, 0)
      // Warm geometry at the selected tier's target size and effect cost. Low
      // startup must never allocate High targets just to prepare a later choice.
      const selected = quality.current()
      for (const next of ["low", "balanced", "high"] as const) {
        const nextContent = profiles.get(next)
        scene.remove(content.planet.mesh, content.grass.mesh)
        content = nextContent
        scene.add(content.planet.mesh, content.grass.mesh)
        draw()
      }
      applyQuality(selected)
      draw()
    })
    scope.defer(
      installTestApi({
        snapshot: () => ({
          position: travelerState.position.toArray(),
          cameraUp: cameraState.up.toArray(),
          grounded: travelerState.grounded,
          distance: travelerDistance,
          running,
          quality: quality.current(),
          reducedMotion,
          simulationTime,
          motorRadius: motorConfig.groundRadius,
          startupContentMs,
          geometryCount: renderer.info.memory.geometries,
          textureCount: renderer.info.memory.textures,
          viewport: { ...renderedViewport },
        }),
        step(frames, intent = {}) {
          if (
            !manual ||
            !running ||
            disposed ||
            !Number.isInteger(frames) ||
            frames < 0 ||
            frames > 3600
          )
            return
          guarded(() => {
            for (let i = 0; i < frames && running; i++) {
              frameIntent = { ...emptyIntent(), ...intent }
              pendingEdges = {
                jumpPressed: i === 0 && !!intent.jumpPressed,
                actionPressed: i === 0 && !!intent.actionPressed,
                pausePressed: i === 0 && !!intent.pausePressed,
              }
              simulate(1 / 60)
            }
            draw()
          })
        },
        outlineSignals(depth, normal) {
          if (manual)
            guarded(() => {
              pipeline.setOutlineSignals(depth, normal)
              draw()
            })
        },
      }),
    )
    const run = () => {
      if (disposed || running) return
      clearPendingEdges()
      input.resume()
      running = true
      previousFrameTime = performance.now()
      if (!manual) loop.resume()
    }
    return {
      ready,
      start: run,
      pause,
      resume: run,
      setQuality: (next) =>
        guarded(() => {
          quality.select(next)
          applyQuality(next)
          draw()
        }),
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
