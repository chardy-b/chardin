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
import {
  createSkyspaceLandmark,
  sphereHeight,
} from "@/engine/world/skyspace-landmark"
import { createSkyspaceCollider } from "@/engine/world/skyspace-collider"
import {
  createSkyController,
  chamberOccupancy,
  inViewingZone,
  SKY_COMMANDS,
  type SkyCommand,
  type SkyStatus,
} from "@/engine/world/sky-controller"
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
  let stopSimulation = () => {}
  const dispose = () => {
    if (disposed) return
    disposed = true
    running = false
    try {
      stopSimulation()
    } catch {
      /* Continue releasing every owner. */
    }
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
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60)
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: false,
      alpha: false,
      powerPreference: "default",
      // Manual frames must survive presentation until the controller captures
      // them. Ordinary play keeps the default disposable drawing buffer.
      preserveDrawingBuffer: manual,
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
    let startupContentMs = performance.now() - contentStart
    scope.defer(() => profiles.dispose())
    let content = profiles.get(quality.current())
    scene.add(content.planet.mesh, content.grass.mesh)
    let landmark: ReturnType<typeof createSkyspaceLandmark> | undefined
    let collider: ReturnType<typeof createSkyspaceCollider> | undefined
    const testParams = manual
      ? new URLSearchParams(window.location.search)
      : undefined
    try {
      if (testParams?.get("landmarkFailure") === "1")
        throw new Error("Injected pavilion failure")
      landmark = createSkyspaceLandmark(
        profiles.get("low").planet.mesh.material.gradientMap,
        (tier, direction) => profiles.get(tier).planet.surfaceAt(direction),
      )
      collider = createSkyspaceCollider(landmark.structure)
      scene.add(landmark.object)
    } catch {
      collider?.dispose()
      landmark?.dispose()
      collider = undefined
      landmark = undefined
    }
    scope.defer(() => {
      collider?.dispose()
      landmark?.dispose()
    })
    startupContentMs = performance.now() - contentStart
    const sky = createSkyController(
      reducedMotion,
      testParams?.get("scoreFailure") !== "1",
    )
    let inside = false,
      viewing = false,
      viewingZone = false
    let lastSkyStatus = ""
    const publishSky = () => {
      const { phase, playback, scoreAvailable } = sky.snapshot()
      const status: SkyStatus = {
        phase,
        playback,
        scoreAvailable,
        inside,
        viewingZone,
        viewing,
        available: !!landmark,
        reducedMotion,
      }
      const key = JSON.stringify(status)
      if (key !== lastSkyStatus) {
        lastSkyStatus = key
        options.onSkyStatus?.(status)
      }
    }
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
    stopSimulation = () => input.pause()
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
      const up = travelerState.supportUp
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
      const local = landmark?.structure.toLocal(travelerState.position)
      const progress =
        local &&
        collider?.nearLandmark?.(travelerState.position) &&
        Math.abs(local.x) <= 1.7 &&
        local.z >= -1.8
          ? THREE.MathUtils.clamp((3.25 - local.z) / 1.6, 0, 1)
          : 0
      cameraState = updateThirdPersonCamera(
        cameraState,
        travelerState,
        motorConfig.planetCenter,
        {
          height: THREE.MathUtils.lerp(portrait ? 2.65 : 2.25, 1.35, progress),
          distance: THREE.MathUtils.lerp(portrait ? 5.5 : 4.4, 0.8, progress),
          targetHeight: THREE.MathUtils.lerp(0.65, 0.85, progress),
          supportUp: up,
          hideTraveler: progress === 1,
          collider,
          viewTarget: viewing
            ? landmark?.structure.toWorld(new THREE.Vector3(0, 2.29, -0.15))
            : undefined,
        },
      )
      travelerView.object.visible = !cameraState.hideTraveler
      const fov = viewing ? (portrait ? 78 : 60) : 42
      if (camera.fov !== fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      camera.position.copy(cameraState.position)
      camera.up.copy(cameraState.up)
      camera.lookAt(cameraState.target)
    }
    const draw = () => {
      if (disposed) return
      const light = sky.frame()
      ;(scene.background as THREE.Color).fromArray(light.sky)
      ;(scene.fog as THREE.Fog).color.fromArray(light.sky)
      sun.color.fromArray(light.sunColor)
      sun.intensity = light.sunIntensity
      sun.position.fromArray(light.sunDirection).multiplyScalar(Math.sqrt(155))
      pipeline.applyLightFrame(light)
      landmark?.applyWall(light.wall)
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
      landmark?.setQuality(next)
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
      if (intent.actionPressed) {
        if (viewing) viewing = false
        else if (viewingZone) {
          viewing = true
          cameraState.yaw = 0
          cameraState.pitch = 0
        }
      }
      // Viewing starts only while grounded. Keep that exact supported pose;
      // even an idle motor step can introduce support-projection roundoff.
      travelerState = viewing
        ? { ...travelerState, locomotion: "idle" }
        : stepPlayerMotor(travelerState, intent, motorConfig, dt, collider)
      if (landmark) {
        const local = landmark.structure.toLocal(travelerState.position)
        inside = chamberOccupancy(local, inside)
        viewingZone = inViewingZone(local, travelerState.grounded)
      }
      sky.step(running, inside)
      publishSky()
      travelerDistance += previousPosition.distanceTo(travelerState.position)
      simulationTime += dt
      // No idle bob or automatic camera orbit; reduced motion freezes the score
      // and idle animation, while movement, manual look and jumping stay available.
      travelerView.update(
        travelerState,
        reducedMotion && travelerState.locomotion === "idle" ? 0 : dt,
      )
      cameraState = applyCameraLook(
        cameraState,
        intent.look,
        dt,
        inside ? 0.35 : undefined,
      )
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
    stopSimulation = () => {
      loop.pause()
      input.pause()
      clearPendingEdges()
    }
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
    const onMotion = (event: MediaQueryListEvent) =>
      guarded(() => {
        // Consume the delivered transition, without re-evaluating the live
        // query during media/style change dispatch. All owners share this value.
        reducedMotion = event.matches
        sky.setReducedMotion(reducedMotion)
        input.pause()
        if (running) input.resume()
        frameIntent = emptyIntent()
        clearPendingEdges()
        publishSky()
        canvas.dataset.reducedMotion = String(reducedMotion)
        applyQuality(quality.current())
        draw()
      })
    motion.addEventListener("change", onMotion)
    scope.defer(() => motion.removeEventListener("change", onMotion))
    canvas.dataset.reducedMotion = String(reducedMotion)
    publishSky()
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
    const stepForTest = (
      frames: number,
      sample: (frame: number) => ControlIntent,
    ) => {
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
          frameIntent = sample(i)
          pendingEdges = {
            jumpPressed: frameIntent.jumpPressed,
            actionPressed: frameIntent.actionPressed,
            pausePressed: frameIntent.pausePressed,
          }
          simulate(1 / 60)
        }
        // One render after the batch: test progress never depends on RAF speed.
        draw()
      })
    }
    scope.defer(
      installTestApi({
        snapshot: () => ({
          generation: options.generation ?? 0,
          forward: travelerState.forward.toArray(),
          supportId: travelerState.supportId,
          supportUp: travelerState.supportUp.toArray(),
          localFeet:
            landmark?.structure.toLocal(travelerState.position).toArray() ?? [],
          cameraPosition: cameraState.position.toArray(),
          cameraTarget: cameraState.target.toArray(),
          cameraMode: cameraState.mode ?? "walking",
          travelerVisible: travelerView.object.visible,
          landmarkAvailable: !!landmark,
          sky: sky.snapshot(),
          route: landmark
            ? [
                new THREE.Vector3(0, sphereHeight(0, 3.65), 3.65),
                new THREE.Vector3(0, sphereHeight(0, 3.25), 3.25),
                new THREE.Vector3(0, 0.12, 1.65),
                new THREE.Vector3(0, 0.12, 1.4),
                new THREE.Vector3(0, 0.12, 0.5),
              ].map((p) => landmark!.structure.toWorld(p).toArray())
            : [],
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
        setSkyTick(tick) {
          if (!manual || disposed) return
          sky.setTick(tick)
          clearPendingEdges()
          input.pause()
          frameIntent = emptyIntent()
          if (running) input.resume()
          publishSky()
          guarded(draw)
        },
        step(frames, intent = {}) {
          stepForTest(frames, (i) => ({
            ...emptyIntent(),
            ...intent,
            jumpPressed: i === 0 && !!intent.jumpPressed,
            actionPressed: i === 0 && !!intent.actionPressed,
            pausePressed: i === 0 && !!intent.pausePressed,
          }))
        },
        stepInput(frames) {
          stepForTest(frames, () => input.sample())
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
    const skyCommand = (command: SkyCommand) => {
      if (!SKY_COMMANDS.includes(command) || disposed) return
      guarded(() => {
        clearPendingEdges()
        input.pause()
        frameIntent = emptyIntent()
        if (running) input.resume()
        if (command === "return-to-clearing" && !running) {
          travelerState = createInitialPlayerState(motorConfig)
          cameraState = createThirdPersonCameraState(
            travelerState,
            motorConfig.planetCenter,
          )
          sky.reset()
          inside = false
          viewing = false
          viewingZone = false
        } else if (landmark) {
          if (command === "view" && running && viewingZone) {
            viewing = true
            cameraState.yaw = 0
            cameraState.pitch = 0
          }
          if (command === "leave-view") viewing = false
          // Playback can be selected while paused; simulation remains gated.
          sky.command(command, inside)
        }
        publishSky()
        draw()
      })
    }
    return {
      skyCommand,
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
