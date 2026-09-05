import * as THREE from "three"

import type {
  ExperienceRuntime,
  MovementIntent,
  TravelerState,
} from "@/engine/contracts"
import {
  createInitialTravelerState,
  stepTraveler,
} from "@/engine/world/traveler-motion"

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

  const intent: MovementIntent = { forward: 0, turn: 0 }
  const keys = new Set<string>()
  let travelerState: TravelerState = createInitialTravelerState(
    PLANET_RADIUS + 0.03,
  )
  let frameId: number | null = null
  let previousTime = 0
  let disposed = false

  const updateIntent = () => {
    intent.forward =
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"))
    intent.turn =
      Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft"))
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
      ].includes(event.code)
    ) {
      event.preventDefault()
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
    camera.position
      .copy(travelerState.position)
      .addScaledVector(up, 2.25)
      .addScaledVector(travelerState.forward, -4.15)
    camera.up.copy(up)
    camera.lookAt(travelerState.position.clone().addScaledVector(up, 0.55))
  }

  const renderFrame = (time: number) => {
    frameId = null
    const delta =
      previousTime === 0 ? 0 : Math.min((time - previousTime) / 1000, 0.05)
    previousTime = time
    travelerState = stepTraveler(
      travelerState,
      intent,
      delta,
      PLANET_RADIUS + 0.03,
    )
    placeTravelerAndCamera()
    renderer.render(scene, camera)
    frameId = window.requestAnimationFrame(renderFrame)
  }
  placeTravelerAndCamera()
  renderer.render(scene, camera)

  const stop = () => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
    previousTime = 0
  }

  return {
    start() {
      if (!disposed && frameId === null)
        frameId = window.requestAnimationFrame(renderFrame)
    },
    pause: stop,
    resume() {
      if (!disposed && frameId === null)
        frameId = window.requestAnimationFrame(renderFrame)
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      resizeObserver.disconnect()
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
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
