// Canvas rendering for the simulation. Pure draw logic, no state of its own.
import type { Body, Simulation } from './physics'
import type { BodyType, BodySubtype } from './types'
import { physicalRadiusMeters, worldRadius } from './units'

export interface DragState {
    active: boolean
    panning: boolean
    wx: number
    wy: number
    sx: number
    sy: number
    mass: number
    type: BodyType
    subType: BodySubtype | undefined
    vLabel: string // formatted launch velocity, shown while dragging
    lastX: number
    lastY: number
}

export interface MeasureState {
    active: boolean
    x0: number // world coords of the two endpoints
    y0: number
    x1: number
    y1: number
    label: string // formatted length
}

interface Star {
    x: number
    y: number
    r: number
    a: number
}

const buildStarfield = (w: number, h: number): Star[] => {
    const stars: Star[] = []
    const count = Math.floor((w * h) / 6000)
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.2 + 0.2,
            a: Math.random() * 0.5 + 0.15,
        })
    }
    return stars
}

// Background gradient + starfield are static for a given canvas size, so they
// are rendered once into an offscreen canvas and blitted each frame.
let bgCanvas: HTMLCanvasElement | null = null
let bgKey = ''

const buildBackground = (w: number, h: number, deviceW: number, deviceH: number): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    // Device resolution keeps the stars crisp on high-DPI displays; drawing
    // happens in CSS-pixel coordinates via the transform.
    c.width = deviceW
    c.height = deviceH
    const ctx = c.getContext('2d')!
    ctx.setTransform(deviceW / w, 0, 0, deviceH / h, 0, 0)

    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75)
    g.addColorStop(0, '#0a0e1f')
    g.addColorStop(1, '#04050b')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#cdd6ff'
    for (const s of buildStarfield(w, h)) {
        ctx.globalAlpha = s.a
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.globalAlpha = 1
    return c
}

export const drawScene = (
    ctx: CanvasRenderingContext2D,
    sim: Simulation,
    drag: DragState | null,
    measure: MeasureState | null,
): void => {
    const { w, h } = sim.view

    // Background gradient + parallax-free starfield (cached offscreen).
    const key = `${ctx.canvas.width}x${ctx.canvas.height}`
    if (key !== bgKey || !bgCanvas) {
        bgCanvas = buildBackground(w, h, ctx.canvas.width, ctx.canvas.height)
        bgKey = key
    }
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(bgCanvas, 0, 0, w, h)

    // Viewport in world coordinates, for culling trails wholly offscreen.
    const [vx0, vy0] = sim.toWorld(0, 0)
    const [vx1, vy1] = sim.toWorld(w, h)

    // Trails.
    if (sim.settings.trails) {
        for (const b of sim.bodies) {
            const t = b.trail
            if (t.length < 4) continue
            // Cheap bounding-box scan: skip the path build + stroke when no
            // part of the trail can intersect the view. Padded by the stroke
            // width in world units so partially visible strokes survive.
            let minX = Infinity,
                maxX = -Infinity,
                minY = Infinity,
                maxY = -Infinity
            for (let i = 0; i < t.length; i += 2) {
                if (t[i] < minX) minX = t[i]
                if (t[i] > maxX) maxX = t[i]
                if (t[i + 1] < minY) minY = t[i + 1]
                if (t[i + 1] > maxY) maxY = t[i + 1]
            }
            const pad = Math.max(1, b.worldRadius(sim.metersPerPixel) * sim.cam.zoom * 0.35) / sim.cam.zoom
            if (maxX < vx0 - pad || minX > vx1 + pad || maxY < vy0 - pad || minY > vy1 + pad) continue
            ctx.strokeStyle = b.color
            ctx.lineWidth = Math.max(1, b.worldRadius(sim.metersPerPixel) * sim.cam.zoom * 0.35)
            ctx.lineCap = 'round'
            ctx.beginPath()
            let started = false
            for (let i = 0; i < t.length; i += 2) {
                const [sx, sy] = sim.toScreen(t[i], t[i + 1])
                if (!started) {
                    ctx.moveTo(sx, sy)
                    started = true
                } else ctx.lineTo(sx, sy)
            }
            ctx.globalAlpha = 0.28
            ctx.stroke()
            ctx.globalAlpha = 1
        }
    }

    // Bodies. Culled against the viewport with the widest glow halo (3r,
    // black holes) as margin, so glows from just-offscreen bodies still show.
    for (const b of sim.bodies) {
        const [sx, sy] = sim.toScreen(b.x, b.y)
        const r = Math.max(1, b.worldRadius(sim.metersPerPixel) * sim.cam.zoom)
        const m = r * 3
        if (sx + m < 0 || sx - m > w || sy + m < 0 || sy - m > h) continue
        drawBody(ctx, b, sx, sy, r)
    }

    // Drag-to-launch preview.
    if (drag && drag.active) {
        drawDragPreview(ctx, sim, drag)
    }

    // Measure-mode ruler.
    if (measure && measure.active) {
        drawMeasure(ctx, sim, measure)
    }
}

const drawMeasure = (ctx: CanvasRenderingContext2D, sim: Simulation, m: MeasureState): void => {
    const [ax, ay] = sim.toScreen(m.x0, m.y0)
    const [bx, by] = sim.toScreen(m.x1, m.y1)

    ctx.strokeStyle = '#7ae0ff'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    ctx.setLineDash([])

    // Endpoint markers.
    ctx.fillStyle = '#7ae0ff'
    for (const [px, py] of [
        [ax, ay],
        [bx, by],
    ] as const) {
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fill()
    }

    // Length label at the midpoint.
    if (m.label) {
        ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif"
        ctx.textBaseline = 'middle'
        const tx = (ax + bx) / 2 + 10
        const ty = (ay + by) / 2 - 10
        const w = ctx.measureText(m.label).width
        ctx.fillStyle = '#0a0c16c7'
        ctx.fillRect(tx - 6, ty - 10, w + 12, 20)
        ctx.fillStyle = '#dff3ff'
        ctx.fillText(m.label, tx, ty)
    }
}

const drawBody = (ctx: CanvasRenderingContext2D, b: Body, sx: number, sy: number, r: number): void => {
    const kind = b.kind

    if (kind === 'blackhole') {
        // Accretion glow ring + dark core.
        const glow = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 3)
        glow.addColorStop(0, '#f0b25c')
        glow.addColorStop(0.5, '#9b632c')
        glow.addColorStop(1, '#00000000')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#05060d'
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#9b632c'
        ctx.lineWidth = 1.5
        ctx.stroke()
        return
    }

    // At a few pixels across, the glow and shading gradients are invisible —
    // a flat disc looks the same and skips two createRadialGradient calls.
    if (r <= 2.5) {
        ctx.fillStyle = b.color
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
        return
    }

    // Stars and planets: radial body + outer glow.
    const glowR = kind === 'star' ? r * 2.6 : r * 1.5
    const glow = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, glowR)
    glow.addColorStop(0, b.color)
    glow.addColorStop(1, '#00000000')
    ctx.globalAlpha = kind === 'star' ? 0.55 : 0.3
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(sx, sy, glowR, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    const body = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r)
    body.addColorStop(0, '#ffffff')
    body.addColorStop(0.25, b.color)
    body.addColorStop(1, shade(b.color, -0.4))
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
}

const drawDragPreview = (ctx: CanvasRenderingContext2D, sim: Simulation, drag: DragState): void => {
    const [sx, sy] = sim.toScreen(drag.wx, drag.wy)
    const ex = drag.sx
    const ey = drag.sy

    // Ghost body sized by the chosen mass at the current length scale.
    const rm = physicalRadiusMeters(drag.mass, drag.type, drag.subType)
    const r = worldRadius(rm, sim.metersPerPixel) * sim.cam.zoom
    ctx.strokeStyle = '#ffffff99'
    ctx.fillStyle = '#ffffff1f'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Velocity arrow (drag direction sets the launch direction).
    ctx.strokeStyle = '#c08bffe6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.stroke()

    const ang = Math.atan2(ey - sy, ex - sx)
    const ah = 9
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - ah * Math.cos(ang - 0.4), ey - ah * Math.sin(ang - 0.4))
    ctx.lineTo(ex - ah * Math.cos(ang + 0.4), ey - ah * Math.sin(ang + 0.4))
    ctx.closePath()
    ctx.fillStyle = '#c08bffe6'
    ctx.fill()

    // Velocity readout near the arrow tip.
    if (drag.vLabel) {
        ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif"
        ctx.textBaseline = 'middle'
        const tx = ex + 12
        const ty = ey - 12
        const w = ctx.measureText(drag.vLabel).width
        ctx.fillStyle = '#0a0c16b8'
        ctx.fillRect(tx - 5, ty - 10, w + 10, 20)
        ctx.fillStyle = '#e8ecff'
        ctx.fillText(drag.vLabel, tx, ty)
    }
}

const shade = (hex: string, amt: number): string => {
    const n = parseInt(hex.slice(1), 16)
    let r = (n >> 16) & 255,
        g = (n >> 8) & 255,
        b = n & 255
    r = Math.max(0, Math.min(255, r + r * amt))
    g = Math.max(0, Math.min(255, g + g * amt))
    b = Math.max(0, Math.min(255, b + b * amt))
    const h = (x: number): string => (x | 0).toString(16).padStart(2, '0')
    return `#${h(r)}${h(g)}${h(b)}`
}
