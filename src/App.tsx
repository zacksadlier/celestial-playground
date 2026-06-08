import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Simulation, Body, isBlackHole, randomColor } from './physics'
import { drawScene } from './render'
import type { DragState, MeasureState } from './render'
import { presets, DEFAULT_PRESET_OPTIONS } from './presets'
import type { PresetName, PresetOptions } from './presets'
import {
    displayToRaw,
    rawToDisplay,
    formatMass,
    formatVelocity,
    subtypeLabel,
    formatLength,
    SCALE_RANGE,
    SPEED_RANGE,
    secondsPerSimTime,
    maxStableSpeed,
    MAX_SUBSTEP_DT,
    MAX_SUBSTEPS,
} from './units'
import type { SimSettings, NewBodyConfig, Stats, Actions, TooltipInfo } from './types'
import Panel from './components/Panel'
import Toolbar from './components/Toolbar'
import InfoModal from './components/InfoModal'

const VELOCITY_SCALE = 0.6 // launch responsiveness: ~fraction of the drag's screen length the body drifts per second

const App = () => {
    let canvas!: HTMLCanvasElement
    const sim = new Simulation()

    // Reactive UI state -----------------------------------------------------
    const [settings, setSettings] = createStore<SimSettings>({
        G: 1.0,
        speed: SPEED_RANGE.default,
        trails: true,
        merge: true,
        elastic: false,
    })
    const [newBody, setNewBody] = createStore<NewBodyConfig>({
        mass: 1,
        type: 'planet',
        subtype: 'terrestrial',
        randomColor: true,
    })
    const [running, setRunning] = createSignal(true)
    const [zoom, setZoom] = createSignal(1)
    const [presetOptions, setPresetOptions] = createStore<PresetOptions>(structuredClone(DEFAULT_PRESET_OPTIONS))
    const [stats, setStats] = createStore<Stats>({ bodies: 0, energy: 0, fps: 0 })
    const [tooltip, setTooltip] = createSignal<TooltipInfo | null>(null)
    const [metersPerPixel, setMetersPerPixel] = createSignal(SCALE_RANGE.default)
    const [measureMode, setMeasureMode] = createSignal(false)
    const [showInfo, setShowInfo] = createSignal(false)

    // Keep the engine's settings in sync with the reactive store.
    createEffect(() => {
        sim.settings.G = settings.G
        sim.settings.speed = settings.speed
        sim.settings.trails = settings.trails
        sim.settings.merge = settings.merge
        sim.settings.elastic = settings.elastic
        if (!settings.trails) for (const b of sim.bodies) b.trail.length = 0
    })

    // Drive the engine's length scale from the UI (affects collisions & sizing).
    createEffect(() => {
        sim.metersPerPixel = metersPerPixel()
    })

    // A tighter scale can't be integrated as fast, so clamp speed to its ceiling
    // when the scale changes — keeps the Speed slider out of the dead zone.
    createEffect(() => {
        const max = maxStableSpeed(metersPerPixel())
        if (settings.speed > max) setSettings('speed', max)
    })

    // Drag-to-launch state (kept off the reactive graph for perf).
    const drag: DragState = {
        active: false,
        panning: false,
        wx: 0,
        wy: 0,
        sx: 0,
        sy: 0,
        mass: 60,
        type: 'planet',
        subtype: 'terrestrial',
        vLabel: '',
        lastX: 0,
        lastY: 0,
    }

    // The launch velocity (sim units) a drag to world point (ex, ey) would produce.
    // Scaling by T(L)/speed gives a consistent on-screen launch regardless of
    // length/time scale (an object's screen speed is vSim·speed/T), and one
    // comparable to the scene's own bodies, which are paced the same way.
    const launchVelocity = (ex: number, ey: number): { vx: number; vy: number } => {
        const k = (VELOCITY_SCALE * secondsPerSimTime(sim.metersPerPixel)) / settings.speed
        return { vx: (ex - drag.wx) * k, vy: (ey - drag.wy) * k }
    }

    // Measure-mode ruler state (world coords; off the reactive graph).
    // `dragging` = freeform drag ruler; bodyA/bodyB = body-to-body ruler (paused).
    const measure: MeasureState & {
        dragging: boolean
        bodyA: Body | null
        bodyB: Body | null
        pending: boolean
    } = {
        active: false,
        dragging: false,
        bodyA: null,
        bodyB: null,
        pending: false,
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
        label: '',
    }

    const resetMeasure = (): void => {
        measure.active = false
        measure.dragging = false
        measure.bodyA = null
        measure.bodyB = null
        measure.pending = false
    }

    // Keep a body-to-body ruler in sync with the (live) body positions. While
    // only the first body is chosen, the far end rubber-bands to the cursor.
    const refreshBodyMeasure = (): void => {
        const a = measure.bodyA
        if (!a) return
        const b = measure.bodyB
        // Drop the measurement if a referenced body was merged away or cleared.
        if (!a.alive || !sim.bodies.includes(a) || (b && (!b.alive || !sim.bodies.includes(b)))) {
            resetMeasure()
            return
        }
        measure.x0 = a.x
        measure.y0 = a.y
        if (b) {
            measure.x1 = b.x
            measure.y1 = b.y
        } else {
            const [mx, my] = sim.toWorld(mouse.x, mouse.y)
            measure.x1 = mx
            measure.y1 = my
        }
        const dist = Math.hypot(measure.x1 - measure.x0, measure.y1 - measure.y0)
        measure.label = formatLength(dist * sim.metersPerPixel)
    }

    // Latest cursor position, used to hit-test bodies for the hover tooltip.
    const mouse = { x: 0, y: 0, inside: false }

    // Find the body under a screen point, if any (nearest centre within radius).
    const pickBody = (sx: number, sy: number): Body | null => {
        const [wx, wy] = sim.toWorld(sx, sy)
        let best: Body | null = null
        let bestDist = Infinity
        for (const b of sim.bodies) {
            const d = Math.hypot(wx - b.x, wy - b.y)
            const hitRadius = b.worldRadius(sim.metersPerPixel) + 4 / sim.cam.zoom
            if (d <= hitRadius && d < bestDist) {
                best = b
                bestDist = d
            }
        }
        return best
    }

    const updateTooltip = (): void => {
        if (drag.active || !mouse.inside) {
            setTooltip(null)
            return
        }
        const b = pickBody(mouse.x, mouse.y)
        if (!b) {
            setTooltip(null)
            return
        }
        const [sx, sy] = sim.toScreen(b.x, b.y)
        // Black holes carry a halo add-on; show the body's own mass and the halo separately.
        const hasHalo = isBlackHole(b) && b.haloMass > 0
        const ownMass = hasHalo ? b.mass - b.haloMass : b.mass
        setTooltip({
            label: subtypeLabel(b.type, b.subtype),
            mass: formatMass(rawToDisplay(ownMass, b.type), b.type),
            halo: hasHalo ? formatMass(rawToDisplay(b.haloMass, b.type), b.type) : undefined,
            velocity: formatVelocity(Math.hypot(b.vx, b.vy), metersPerPixel()),
            x: sx,
            y: sy,
        })
    }

    // ---- Simulation + render loop ----------------------------------------
    let raf = 0
    let lastFrame = performance.now()
    let fpsAcc = 0,
        fpsCount = 0,
        fpsTimer = 0

    // Advance the sim by `simSeconds` of simulated time. The length scale sets how
    // many sim-time units that is (T = √(L³/GK)), so larger scales evolve slower.
    // Substeps scale with the requested step so each stays stable; only when the
    // step exceeds MAX_SUBSTEPS·MAX_SUBSTEP_DT does the rate actually plateau.
    const advance = (simSeconds: number): void => {
        let dtSim = simSeconds / secondsPerSimTime(metersPerPixel())
        if (dtSim <= 0) return
        let substeps = Math.ceil(dtSim / MAX_SUBSTEP_DT)
        if (substeps > MAX_SUBSTEPS) {
            substeps = MAX_SUBSTEPS
            dtSim = substeps * MAX_SUBSTEP_DT // clamp the total to what we can stably integrate
        }
        const sub = dtSim / substeps
        for (let i = 0; i < substeps; i++) sim.step(sub)
        if (settings.trails) sim.recordTrails()
    }

    const loop = (now: number): void => {
        const realDt = Math.min(now - lastFrame, 100)
        lastFrame = now

        if (running() && sim.bodies.length > 0) {
            advance(settings.speed * (realDt / 1000))
        }

        if (drag.active && !drag.panning) {
            const [ex, ey] = sim.toWorld(drag.sx, drag.sy)
            const { vx, vy } = launchVelocity(ex, ey)
            drag.vLabel = formatVelocity(Math.hypot(vx, vy), sim.metersPerPixel)
        }

        refreshBodyMeasure()

        const ctx = canvas.getContext('2d')!
        drawScene(ctx, sim, drag.active && !drag.panning ? drag : null, measure.active ? measure : null)
        updateTooltip()

        // FPS + stats, refreshed a few times a second.
        fpsAcc += realDt
        fpsCount++
        fpsTimer += realDt
        if (fpsTimer >= 400) {
            setStats({
                bodies: sim.bodies.length,
                energy: sim.totalEnergy(),
                fps: Math.round(1000 / (fpsAcc / fpsCount)),
            })
            fpsAcc = 0
            fpsCount = 0
            fpsTimer = 0
        }

        raf = requestAnimationFrame(loop)
    }

    // ---- Canvas sizing ----------------------------------------------------
    const resize = (): void => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = window.innerWidth * dpr
        canvas.height = window.innerHeight * dpr
        canvas.style.width = window.innerWidth + 'px'
        canvas.style.height = window.innerHeight + 'px'
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        sim.view.w = window.innerWidth
        sim.view.h = window.innerHeight
    }

    // ---- Pointer interaction ---------------------------------------------
    const onPointerDown = (e: PointerEvent): void => {
        canvas.setPointerCapture(e.pointerId)
        const pan = e.button === 1 || e.button === 2 || e.shiftKey
        if (pan) {
            drag.active = true
            drag.panning = true
            drag.lastX = e.clientX
            drag.lastY = e.clientY
            return
        }
        if (measureMode()) {
            // While paused, clicking bodies measures between their centres.
            if (!running()) {
                const b = pickBody(e.clientX, e.clientY)
                if (b) {
                    if (measure.pending && measure.bodyA && b !== measure.bodyA) {
                        measure.bodyB = b // second pick completes the ruler
                        measure.pending = false
                    } else {
                        measure.bodyA = b // first pick (or restart)
                        measure.bodyB = null
                        measure.pending = true
                        measure.active = true
                    }
                    refreshBodyMeasure()
                    return
                }
            }
            // Otherwise: freeform drag ruler (empty space, or while running).
            measure.bodyA = null
            measure.bodyB = null
            measure.pending = false
            const [mx, my] = sim.toWorld(e.clientX, e.clientY)
            measure.active = true
            measure.dragging = true
            measure.x0 = measure.x1 = mx
            measure.y0 = measure.y1 = my
            measure.label = formatLength(0)
            return
        }
        const [wx, wy] = sim.toWorld(e.clientX, e.clientY)
        drag.active = true
        drag.panning = false
        drag.wx = wx
        drag.wy = wy
        drag.sx = e.clientX
        drag.sy = e.clientY
        drag.mass = displayToRaw(newBody.mass, newBody.type)
        drag.type = newBody.type
        drag.subtype = newBody.subtype
    }

    const onPointerMove = (e: PointerEvent): void => {
        mouse.x = e.clientX
        mouse.y = e.clientY
        mouse.inside = true
        if (measure.dragging) {
            const [mx, my] = sim.toWorld(e.clientX, e.clientY)
            measure.x1 = mx
            measure.y1 = my
            const dist = Math.hypot(measure.x1 - measure.x0, measure.y1 - measure.y0)
            measure.label = formatLength(dist * sim.metersPerPixel)
            return
        }
        if (!drag.active) return
        if (drag.panning) {
            sim.cam.x -= (e.clientX - drag.lastX) / sim.cam.zoom
            sim.cam.y -= (e.clientY - drag.lastY) / sim.cam.zoom
            drag.lastX = e.clientX
            drag.lastY = e.clientY
            return
        }
        drag.sx = e.clientX
        drag.sy = e.clientY
    }

    const onPointerUp = (e: PointerEvent): void => {
        if (measure.dragging) {
            measure.dragging = false // keep the line on screen for reading
            return
        }
        if (!drag.active) return
        if (!drag.panning) {
            const [ex, ey] = sim.toWorld(e.clientX, e.clientY)
            const { vx, vy } = launchVelocity(ex, ey)
            sim.add(
                new Body({
                    x: drag.wx,
                    y: drag.wy,
                    vx,
                    vy,
                    mass: displayToRaw(newBody.mass, newBody.type),
                    type: newBody.type,
                    subtype: newBody.subtype,
                    color: newBody.randomColor ? randomColor() : undefined,
                }),
            )
            setStats('bodies', sim.bodies.length)
        }
        drag.active = false
        drag.panning = false
    }

    const onWheel = (e: WheelEvent): void => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        const [bx, by] = sim.toWorld(e.clientX, e.clientY)
        sim.cam.zoom = Math.max(0.1, Math.min(8, sim.cam.zoom * factor))
        // Keep the point under the cursor fixed while zooming.
        const [ax, ay] = sim.toWorld(e.clientX, e.clientY)
        sim.cam.x += bx - ax
        sim.cam.y += by - ay
        setZoom(sim.cam.zoom)
    }

    // ---- Public actions for child controls -------------------------------
    const loadPreset = (name: PresetName): void => {
        sim.clear()
        sim.cam = { x: 0, y: 0, zoom: 1 }
        setZoom(1)
        const scene = presets[name](settings.G, presetOptions[name] as never)
        // Apply the preset's framing: length scale (also set on the engine directly
        // so the first frame's sizing/collisions use it) and playback speed.
        setMetersPerPixel(scene.metersPerPixel)
        sim.metersPerPixel = scene.metersPerPixel
        setSettings('speed', scene.speed)
        for (const b of scene.bodies) sim.add(b)
        setRunning(true)
        setStats('bodies', sim.bodies.length)
    }

    const applyZoom = (f: number): void => {
        sim.cam.zoom = Math.max(0.1, Math.min(8, sim.cam.zoom * f))
        setZoom(sim.cam.zoom)
    }

    const actions: Actions = {
        togglePlay: () => setRunning((r) => !r),
        step: () => advance(settings.speed / 60), // one nominal frame of simulated time
        clear: () => {
            sim.clear()
            setStats('bodies', 0)
            setMeasureMode(false)
            resetMeasure()
        },
        zoomIn: () => applyZoom(1.25),
        zoomOut: () => applyZoom(1 / 1.25),
        resetView: () => {
            sim.cam = { x: 0, y: 0, zoom: 1 }
            setZoom(1)
        },
        toggleMeasure: () => {
            const on = !measureMode()
            setMeasureMode(on)
            if (!on) resetMeasure() // clear the ruler when leaving measure mode
        },
    }

    const onKey = (e: KeyboardEvent): void => {
        if (e.code === 'Escape' && showInfo()) {
            setShowInfo(false)
            return
        }
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'SELECT') return
        if (e.code === 'Space') {
            e.preventDefault()
            actions.togglePlay()
        } else if (e.code === 'KeyC') actions.clear()
        else if (e.code === 'KeyS') actions.step()
    }

    // ---- Lifecycle --------------------------------------------------------
    onMount(() => {
        resize()
        loadPreset('solar')
        window.addEventListener('resize', resize)
        window.addEventListener('keydown', onKey)
        raf = requestAnimationFrame(loop)
    })

    onCleanup(() => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', resize)
        window.removeEventListener('keydown', onKey)
    })

    return (
        <>
            <canvas
                ref={canvas}
                id='space'
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => {
                    mouse.inside = false
                }}
                onWheel={onWheel}
                onContextMenu={(e) => e.preventDefault()}
            />

            <Show when={tooltip()}>
                {(t) => (
                    <div class='tooltip' style={{ left: `${t().x + 16}px`, top: `${t().y + 16}px` }}>
                        <div class='tt-title'>{t().label}</div>
                        <div class='tt-row'>
                            <span>Mass</span>
                            <b>{t().mass}</b>
                        </div>
                        <Show when={t().halo}>
                            <div class='tt-row'>
                                <span>Halo</span>
                                <b>{t().halo}</b>
                            </div>
                        </Show>
                        <div class='tt-row'>
                            <span>Velocity</span>
                            <b>{t().velocity}</b>
                        </div>
                    </div>
                )}
            </Show>
            <header id='topbar'>
                <div class='brand'>
                    <span class='logo'>✦</span>
                    <span class='title'>Celestial&nbsp;Playground</span>
                </div>
                <div class='hint'>Drag on empty space to launch a body · Scroll to zoom · Right-click to pan</div>
                <button id='info-btn' title='About &amp; controls' onClick={() => setShowInfo(true)}>
                    ⓘ
                </button>
            </header>

            <Show when={showInfo()}>
                <InfoModal onClose={() => setShowInfo(false)} />
            </Show>

            <Panel
                settings={settings}
                setSettings={setSettings}
                newBody={newBody}
                setNewBody={setNewBody}
                stats={stats}
                loadPreset={loadPreset}
                presetOptions={presetOptions}
                setPresetOptions={setPresetOptions}
                scale={metersPerPixel}
                setScale={setMetersPerPixel}
            />

            <Toolbar running={running} zoom={zoom} measuring={measureMode} actions={actions} />
        </>
    )
}

export default App
