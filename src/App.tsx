import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Simulation, Body, randomColor, findOrbit } from './physics'
import { drawScene } from './render'
import type { DragState } from './render'
import { presets, DEFAULT_PRESET_OPTIONS } from './presets'
import type { PresetName, PresetOptions } from './presets'
import {
    displayToRaw,
    formatVelocity,
    formatLength,
    secondsPerSimTime,
    lightSpeedSimVel,
    maxStableSpeed,
} from './lib/units'
import { SCALE_RANGE, SPEED_RANGE, MAX_SUBSTEPS, VELOCITY_SCALE } from './lib/constants'
import type { SimSettings, NewBodyConfig, Stats, Actions, InteractionMode } from './lib/types'
import { createMeasure } from './ui/measure'
import { createTooltips } from './ui/tooltips'
import { Info, Menu, X } from 'lucide-solid'
import Panel from './components/Panel'
import Toolbar from './components/Toolbar'
import InfoModal from './components/InfoModal'
import BodyTooltip from './components/BodyTooltip'

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
        subType: 'terrestrial',
        randomColor: true,
    })
    const [running, setRunning] = createSignal(true)
    const [zoom, setZoom] = createSignal(1)
    const [presetOptions, setPresetOptions] = createStore<PresetOptions>(structuredClone(DEFAULT_PRESET_OPTIONS))
    const [stats, setStats] = createStore<Stats>({ bodies: 0, energy: 0, fps: 0 })
    const [metersPerPixel, setMetersPerPixel] = createSignal(SCALE_RANGE.default)
    const [mode, setMode] = createSignal<InteractionMode>('body')
    const [showInfo, setShowInfo] = createSignal(false)
    // The settings panel is a drawer - collapsed by default on small (mobile)
    // viewports so the canvas isn't covered; open by default on wider screens.
    const [panelOpen, setPanelOpen] = createSignal(window.innerWidth > 720)

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
    // when the scale changes - keeps the Speed slider out of the dead zone.
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
        subType: 'terrestrial',
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
        let vx = (ex - drag.wx) * k
        let vy = (ey - drag.wy) * k
        // Cap the launch at the speed of light.
        const vMax = lightSpeedSimVel(sim.metersPerPixel)
        const v = Math.hypot(vx, vy)
        if (v > vMax) {
            vx *= vMax / v
            vy *= vMax / v
        }
        return { vx, vy }
    }

    // Latest cursor position, used to hit-test bodies for the hover tooltip.
    const mouse = { x: 0, y: 0, inside: false }

    // Measure tool (ruler state + body-to-body refresh) lives in its own module.
    const { measure, resetMeasure, refreshBodyMeasure } = createMeasure(sim, mouse)

    // Press tracking, to tell a click (pins a body) from a drag (launches a body).
    const CLICK_MOVE_PX = 5
    let pressBody: Body | null = null
    let pressX = 0
    let pressY = 0

    // Multi-touch state for pinch-zoom / two-finger pan. While two or more touch
    // points are down we drive the camera instead of launching a body.
    const activeTouches = new Map<number, { x: number; y: number }>()
    let pinchDist = 0 // last finger separation (px); > 0 means a pinch is in progress
    let pinchMidX = 0
    let pinchMidY = 0

    // A second finger turns the gesture into a pinch: abandon the pending
    // single-touch launch and seed the pinch metrics.
    const beginPinch = (): void => {
        drag.active = false
        drag.panning = false
        pressBody = null
        const [a, b] = [...activeTouches.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        pinchMidX = (a.x + b.x) / 2
        pinchMidY = (a.y + b.y) / 2
    }

    // Drive the camera from the two touch points: scale about their midpoint
    // (keeping the world point under it fixed) and pan by the midpoint's movement.
    const updatePinch = (): void => {
        const [a, b] = [...activeTouches.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2

        const [wx, wy] = sim.toWorld(midX, midY)
        if (pinchDist > 0) {
            sim.cam.zoom = Math.max(0.1, Math.min(8, sim.cam.zoom * (dist / pinchDist)))
        }
        const [ax, ay] = sim.toWorld(midX, midY)
        sim.cam.x += wx - ax
        sim.cam.y += wy - ay

        // Two-finger drag pans by how far the midpoint moved.
        sim.cam.x -= (midX - pinchMidX) / sim.cam.zoom
        sim.cam.y -= (midY - pinchMidY) / sim.cam.zoom

        pinchDist = dist
        pinchMidX = midX
        pinchMidY = midY
        setZoom(sim.cam.zoom)
    }

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

    // Hover + pinned tooltips (and the over-body flag for the Pan cursor) live in
    // their own module; it owns the pinned-body signal too.
    const { hoverTip, pinnedTip, pinned, setPinned, overBody, updateTooltip } = createTooltips({
        sim,
        mouse,
        drag,
        pickBody,
        metersPerPixel,
        gravity: () => settings.G,
    })

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
        // Size the substep to the scene's dynamics: when massive bodies are close
        // their orbit needs a far finer step than MAX_SUBSTEP_DT, otherwise they
        // fly past instead of binding. Heavy scenes therefore hit the substep cap
        // sooner and advance more slowly (in real time) but stay stable.
        const stableDt = sim.maxStableDt()
        let substeps = Math.ceil(dtSim / stableDt)
        if (substeps > MAX_SUBSTEPS) {
            substeps = MAX_SUBSTEPS
            dtSim = substeps * stableDt // clamp the total to what we can stably integrate
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

        // Orbital path of the pinned body, when it's bound to a heavier primary.
        const pin = pinned()
        const orbit = pin && pin.alive && sim.bodies.includes(pin) ? findOrbit(sim.bodies, pin, settings.G) : null
        const orbitOverlay = orbit
            ? {
                  parent: orbit.parent,
                  semiMajorPx: orbit.semiMajorPx,
                  eccentricity: orbit.eccentricity,
                  argPeriapsis: orbit.argPeriapsis,
                  color: pin!.color,
              }
            : null

        const ctx = canvas.getContext('2d')!
        drawScene(ctx, sim, drag.active && !drag.panning ? drag : null, measure.active ? measure : null, orbitOverlay, pin)
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
        if (e.pointerType === 'touch') {
            activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY })
            // A second finger starts a pinch - handle the camera, not a new body.
            if (activeTouches.size >= 2) {
                beginPinch()
                return
            }
        }
        // Pan on a middle/right/shift drag always, and on a plain left drag when
        // Pan mode is active.
        const pan = e.button === 1 || e.button === 2 || e.shiftKey || mode() === 'pan'
        if (pan) {
            drag.active = true
            drag.panning = true
            drag.lastX = e.clientX
            drag.lastY = e.clientY
            // In Pan mode, a left press that doesn't turn into a drag still pins the
            // body underneath (resolved on release); other pan gestures don't pin.
            pressBody = mode() === 'pan' && e.button === 0 ? pickBody(e.clientX, e.clientY) : null
            pressX = e.clientX
            pressY = e.clientY
            return
        }
        if (mode() === 'measure') {
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
        // Remember whether the press landed on a body, to detect a click-to-pin on release.
        pressBody = pickBody(e.clientX, e.clientY)
        pressX = e.clientX
        pressY = e.clientY
        drag.active = true
        drag.panning = false
        drag.wx = wx
        drag.wy = wy
        drag.sx = e.clientX
        drag.sy = e.clientY
        drag.mass = displayToRaw(newBody.mass, newBody.type)
        drag.type = newBody.type
        drag.subType = newBody.subType

        // Clear pinned tooltip on the click
        setPinned(null)
    }

    const onPointerMove = (e: PointerEvent): void => {
        if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
            activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (activeTouches.size >= 2) {
                updatePinch()
                return
            }
        }
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
        if (e.pointerType === 'touch') activeTouches.delete(e.pointerId)
        // While (or just after) a pinch, don't let a lifted finger launch a body.
        if (pinchDist > 0) {
            drag.active = false
            drag.panning = false
            if (activeTouches.size < 2) pinchDist = 0
            return
        }
        if (measure.dragging) {
            measure.dragging = false // keep the line on screen for reading
            return
        }
        if (!drag.active) return
        const movedPx = Math.hypot(e.clientX - pressX, e.clientY - pressY)
        if (pressBody && pressBody.alive && movedPx <= CLICK_MOVE_PX) {
            // A click (not a drag) on a body pins its tooltip - in Body or Pan mode;
            // clicking the same body again unpins it, another switches the pin.
            setPinned((prev) => (prev === pressBody ? null : pressBody))
        } else if (!drag.panning) {
            // A drag, or a click on empty space, in Body mode launches a new body.
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
                    subType: newBody.subType,
                    color: newBody.randomColor ? randomColor() : undefined,
                }),
            )
            setStats('bodies', sim.bodies.length)
        }
        pressBody = null
        drag.active = false
        drag.panning = false
    }

    // A cancelled pointer (e.g. capture lost) - drop it from the gesture state.
    const onPointerCancel = (e: PointerEvent): void => {
        if (e.pointerType === 'touch') activeTouches.delete(e.pointerId)
        if (activeTouches.size < 2) pinchDist = 0
        drag.active = false
        drag.panning = false
        pressBody = null
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
        setPinned(null)
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
            resetMeasure()
            setPinned(null)
        },
        zoomIn: () => applyZoom(1.25),
        zoomOut: () => applyZoom(1 / 1.25),
        resetView: () => {
            sim.cam = { x: 0, y: 0, zoom: 1 }
            setZoom(1)
        },
        setMode: (m) => {
            // Leaving measure mode drops any half-built ruler.
            if (mode() === 'measure' && m !== 'measure') resetMeasure()
            setMode(m)
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
                classList={{
                    'mode-pan': mode() === 'pan',
                    'mode-measure': mode() === 'measure',
                    'over-body': overBody(),
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onPointerLeave={() => {
                    mouse.inside = false
                }}
                onWheel={onWheel}
                onContextMenu={(e) => e.preventDefault()}
            />

            <Show when={pinnedTip()}>{(t) => <BodyTooltip info={t()} onDismiss={() => setPinned(null)} />}</Show>
            <Show when={hoverTip()}>{(t) => <BodyTooltip info={t()} />}</Show>
            <header id='topbar'>
                <button
                    id='menu-toggle'
                    class='icon-btn'
                    title={panelOpen() ? 'Hide menu' : 'Show menu'}
                    aria-label={panelOpen() ? 'Hide menu' : 'Show menu'}
                    onClick={() => setPanelOpen((o) => !o)}
                >
                    {panelOpen() ? <X size={18} /> : <Menu size={18} />}
                </button>
                <div class='brand'>
                    <span class='logo'>✦</span>
                    <span class='title'>Celestial&nbsp;Playground</span>
                </div>
                <div class='hint'>Drag on empty space to launch a body · Scroll to zoom · Right-click to pan</div>
                <a
                    id='github-btn'
                    class='icon-btn'
                    href='https://github.com/zacksadlier/celestial-playground'
                    target='_blank'
                    rel='noopener noreferrer'
                    title='View source on GitHub'
                    aria-label='View source on GitHub'
                >
                    <svg viewBox='0 0 16 16' width='18' height='18' aria-hidden='true' fill='currentColor'>
                        <path d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z' />
                    </svg>
                </a>
                <button id='info-btn' class='icon-btn' title='About &amp; controls' onClick={() => setShowInfo(true)}>
                    <Info size={18} />
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
                open={panelOpen}
            />

            <Toolbar running={running} zoom={zoom} mode={mode} actions={actions} />
        </>
    )
}

export default App
