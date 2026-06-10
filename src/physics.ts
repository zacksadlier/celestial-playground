// Gravitational N-body simulation engine — independent of any UI framework.
import { physicalRadiusMeters, worldRadius, rawToDisplay, MAX_SUBSTEP_DT, STABILITY_ETA } from './units'
import type {
    BodyType,
    BodyKind,
    PlanetSubtype,
    StarSubtype,
    EvolvedStar,
    BodySubtype,
    BodyOptions,
    SimSettings,
    Camera,
} from './types'

// Characteristic colours for each subType (rough; tweak to taste). Stars get a
// few slight shade variants so identical classes don't all look the same.
const SUBTYPE_COLORS: Record<BodySubtype, string[]> = {
    terrestrial: ['#9a8f86'], // rocky grey-brown
    gasGiant: ['#e0a868'], // tan / orange bands
    O: ['#9bb0ff', '#8fa6ff', '#a7baff'], // blue
    B: ['#b7c6ff', '#aabcff', '#c2cfff'], // blue-white
    A: ['#dbe4ff', '#d0dbff', '#e4ebff'], // white
    F: ['#f7f4ec', '#fbf8f1', '#f2ede0'], // yellow-white
    G: ['#ffe9a8', '#ffe399', '#ffefbc'], // yellow (Sun-like)
    K: ['#ffc079', '#ffb868', '#ffca8e'], // orange
    M: ['#ff8a5c', '#ff7e4d', '#ff9870'], // red-orange
    whiteDwarf: ['#dbe9ff', '#cfe1ff', '#e6f0ff'], // hot blue-white
    redGiant: ['#ff6a4a', '#ff5c3a', '#ff7a5e'], // cool, luminous red-orange
    neutronStar: ['#bcd4ff', '#aecbff', '#cadeff'], // intense blue-white
}

// Mean density (kg/m³) for evolved stars, whose radius is decoupled from mass.
// Chosen so the canonical mass gives the real size: white dwarf ≈ Earth-sized,
// neutron star ≈ 11 km, red giant ≈ 50 R☉.
export const EVOLVED_STAR_DENSITY: Record<EvolvedStar, number> = {
    whiteDwarf: 1e9,
    redGiant: 0.011,
    neutronStar: 5e17,
}

export const subtypeColor = (subType: BodySubtype): string => {
    const shades = SUBTYPE_COLORS[subType]
    return shades[Math.floor(Math.random() * shades.length)]
}

// Terrestrial below ~10 Earth masses, gas giant above.
const classifyPlanet = (massRaw: number): PlanetSubtype =>
    rawToDisplay(massRaw, 'planet') < 10 ? 'terrestrial' : 'gasGiant'

// Approximate main-sequence spectral class from mass (solar masses).
const classifyStar = (massRaw: number): StarSubtype => {
    const m = rawToDisplay(massRaw, 'star')
    if (m >= 16) return 'O'
    if (m >= 2.1) return 'B'
    if (m >= 1.4) return 'A'
    if (m >= 1.04) return 'F'
    if (m >= 0.8) return 'G'
    if (m >= 0.45) return 'K'
    return 'M'
}

// Default subType derived from a body's mass (black holes have none).
export const defaultSubtype = (type: BodyType, massRaw: number): BodySubtype | undefined => {
    if (type === 'planet') return classifyPlanet(massRaw)
    if (type === 'star') return classifyStar(massRaw)
    return undefined
}

// Hard cap on the number of bodies. Gravity is exact O(n²); beyond this the
// per-frame cost isn't worth it, so further additions are simply ignored.
export const MAX_BODIES = 1000

// Above this body count, collisions use a sweep-and-prune broad phase instead
// of the exact O(n²) all-pairs scan.
export const COLLISION_BROADPHASE_AT = 256

const PALETTE = [
    '#7aa2ff',
    '#c08bff',
    '#ff8bba',
    '#ffd27a',
    '#7ae0ff',
    '#9bff8b',
    '#ff9b6b',
    '#e0e0ff',
    '#8bffd6',
    '#ffb38b',
]

export const randomColor = (): string => {
    return PALETTE[(Math.random() * PALETTE.length) | 0]
}

let nextId = 1

export class Body {
    id: number
    x: number
    y: number
    vx: number
    vy: number
    mass: number // total gravitational mass (includes any halo add-on)
    haloMass: number // dark-matter-halo portion of `mass`, shown separately; 0 for normal bodies
    color: string
    type: BodyType
    subType: BodySubtype | undefined // composition (planets) / spectral class (stars); none for black holes
    trail: number[]
    alive: boolean
    radiusMeters: number

    constructor({ x, y, vx = 0, vy = 0, mass = 60, color, type = 'planet', subType, haloMass = 0 }: BodyOptions) {
        this.id = nextId++
        this.x = x
        this.y = y
        this.vx = vx
        this.vy = vy
        this.mass = mass
        this.haloMass = haloMass
        this.type = type
        this.subType = subType ?? defaultSubtype(type, mass)
        // Default colour follows the subType; falls back to a random palette colour.
        this.color = color || (this.subType ? subtypeColor(this.subType) : randomColor())
        this.trail = []
        this.alive = true
        // Visible radius reflects only the body's own (non-halo) mass.
        this.radiusMeters = physicalRadiusMeters(mass - haloMass, type, this.subType)
    }

    // On-screen radius (world units / pixels at zoom 1) for the given length scale.
    worldRadius(metersPerPixel: number): number {
        return worldRadius(this.radiusMeters, metersPerPixel)
    }

    get kind(): BodyKind {
        return this.type
    }
}

// Type-specific views of a Body, narrowed by its `type` discriminant. Use the
// guards below to access the per-type shape (e.g. a black hole's halo mass).
export interface PlanetBody extends Body {
    type: 'planet'
    subType: PlanetSubtype
}

export interface StarBody extends Body {
    type: 'star'
    subType: StarSubtype
}

export interface BlackHoleBody extends Body {
    type: 'blackhole'
    haloMass: number // dark-matter-halo add-on; only galaxy cores carry one
}

export type TypedBody = PlanetBody | StarBody | BlackHoleBody

export const isPlanet = (b: Body): b is PlanetBody => b.type === 'planet'
export const isStar = (b: Body): b is StarBody => b.type === 'star'
export const isBlackHole = (b: Body): b is BlackHoleBody => b.type === 'blackhole'

export class Simulation {
    bodies: Body[] = []
    settings: SimSettings = {
        G: 1.0,
        speed: 1.0,
        trails: true,
        merge: true,
        elastic: false,
    }
    // Camera: world point shown at canvas centre, plus a zoom factor.
    cam: Camera = { x: 0, y: 0, zoom: 1 }
    view = { w: 0, h: 0 }
    softening = 6 // avoids singular forces at tiny separations
    metersPerPixel = 1.495978707e11 // length scale (driven by the UI), 1 AU default
    // Reusable scratch for the sweep-and-prune collision broad phase.
    private spIdx: number[] = []
    private spLeft: number[] = []
    private spRight: number[] = []
    private spActive: number[] = []

    // Add a body, unless the sim is already at the cap.
    add(body: Body): void {
        if (this.bodies.length >= MAX_BODIES) return
        this.bodies.push(body)
    }

    clear(): void {
        this.bodies = []
    }

    // ---- Coordinate transforms -------------------------------------------
    toScreen(wx: number, wy: number): [number, number] {
        return [
            (wx - this.cam.x) * this.cam.zoom + this.view.w / 2,
            (wy - this.cam.y) * this.cam.zoom + this.view.h / 2,
        ]
    }

    toWorld(sx: number, sy: number): [number, number] {
        return [
            (sx - this.view.w / 2) / this.cam.zoom + this.cam.x,
            (sy - this.view.h / 2) / this.cam.zoom + this.cam.y,
        ]
    }

    // ---- Physics ---------------------------------------------------------
    step(dt: number): void {
        this.applyGravity(dt)

        // Integrate positions (semi-implicit Euler).
        const bodies = this.bodies
        for (let i = 0; i < bodies.length; i++) {
            const a = bodies[i]
            a.x += a.vx * dt
            a.y += a.vy * dt
        }

        this.handleCollisions()

        if (this.settings.elastic) this.bounceWalls()
    }

    // Exact O(n²) pairwise gravity. Symmetric, so momentum is conserved exactly.
    private applyGravity(dt: number): void {
        const { G } = this.settings
        const bodies = this.bodies
        const n = bodies.length
        const soft2 = this.softening * this.softening
        for (let i = 0; i < n; i++) {
            const a = bodies[i]
            for (let j = i + 1; j < n; j++) {
                const b = bodies[j]
                const dx = b.x - a.x
                const dy = b.y - a.y
                const r2 = dx * dx + dy * dy + soft2
                const r = Math.sqrt(r2)
                const force = (G * a.mass * b.mass) / r2
                const fx = (force * dx) / r
                const fy = (force * dy) / r
                a.vx += (fx / a.mass) * dt
                a.vy += (fy / a.mass) * dt
                b.vx -= (fx / b.mass) * dt
                b.vy -= (fy / b.mass) * dt
            }
        }
    }

    // Largest substep (in sim-time) that integrates the current configuration
    // stably. The dynamical time of a pair is t_dyn ≈ √(r³ / G(mₐ+m_b)); for
    // massive, close bodies it can be far shorter than MAX_SUBSTEP_DT, and a
    // step that overshoots it makes semi-implicit Euler slingshot the pair
    // through each other rather than capturing it into orbit. We take the
    // tightest pair and back off by STABILITY_ETA, capped at MAX_SUBSTEP_DT for
    // sparse/light scenes where nothing is demanding.
    maxStableDt(): number {
        const { G } = this.settings
        const bodies = this.bodies
        const n = bodies.length
        const soft2 = this.softening * this.softening
        let minTdyn = Infinity
        for (let i = 0; i < n; i++) {
            const a = bodies[i]
            for (let j = i + 1; j < n; j++) {
                const b = bodies[j]
                const dx = b.x - a.x
                const dy = b.y - a.y
                const r2 = dx * dx + dy * dy + soft2
                const tdyn = Math.sqrt((r2 * Math.sqrt(r2)) / (G * (a.mass + b.mass)))
                if (tdyn < minTdyn) minTdyn = tdyn
            }
        }
        if (!isFinite(minTdyn)) return MAX_SUBSTEP_DT
        return Math.min(MAX_SUBSTEP_DT, STABILITY_ETA * minTdyn)
    }

    recordTrails(): void {
        for (const b of this.bodies) {
            b.trail.push(b.x, b.y)
            if (b.trail.length > 90) b.trail.splice(0, b.trail.length - 90)
        }
    }

    handleCollisions(): void {
        if (this.bodies.length >= COLLISION_BROADPHASE_AT) this.collideSweep()
        else this.collideAllPairs()

        if (this.settings.merge) {
            this.bodies = this.bodies.filter((b) => b.alive)
        }
    }

    // Exact O(n²) pair scan — used for small scenes where it's cheapest.
    private collideAllPairs(): void {
        const bodies = this.bodies
        const mpp = this.metersPerPixel
        for (let i = 0; i < bodies.length; i++) {
            const a = bodies[i]
            if (!a.alive) continue
            for (let j = i + 1; j < bodies.length; j++) {
                const b = bodies[j]
                if (!b.alive) continue
                this.tryCollide(a, b, mpp)
                if (!a.alive) break // a was consumed; move to next i
            }
        }
    }

    // Sweep-and-prune broad phase: sort by x-extent, only test bodies whose
    // x-intervals overlap. Sub-quadratic when bodies are spatially spread out.
    private collideSweep(): void {
        const bodies = this.bodies
        const n = bodies.length
        const mpp = this.metersPerPixel
        const left = this.spLeft,
            right = this.spRight,
            idx = this.spIdx
        left.length = right.length = idx.length = n
        for (let i = 0; i < n; i++) {
            const b = bodies[i]
            const r = b.worldRadius(mpp)
            left[i] = b.x - r
            right[i] = b.x + r
            idx[i] = i
        }
        idx.sort((p, q) => left[p] - left[q])

        const active = this.spActive
        active.length = 0
        for (let s = 0; s < n; s++) {
            const bi = idx[s]
            const bLeft = left[bi]
            // Drop bodies whose x-interval ends before this one begins.
            for (let k = active.length - 1; k >= 0; k--) {
                const ai = active[k]
                if (right[ai] < bLeft) {
                    active[k] = active[active.length - 1]
                    active.pop()
                }
            }
            const b = bodies[bi]
            if (b.alive) {
                for (let k = 0; k < active.length; k++) {
                    this.tryCollide(bodies[active[k]], b, mpp)
                    if (!b.alive) break // b was consumed by a merge
                }
            }
            active.push(bi)
        }
    }

    // Resolve a candidate pair: merge or bounce if they actually overlap.
    private tryCollide(a: Body, b: Body, mpp: number): void {
        if (!a.alive || !b.alive) return
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy)
        if (dist < a.worldRadius(mpp) + b.worldRadius(mpp)) {
            if (this.settings.merge) this.merge(a, b)
            else this.resolveBounce(a, b, dx, dy, dist)
        }
    }

    merge(a: Body, b: Body): void {
        // Heavier body absorbs the lighter one; conserve momentum & mass.
        const big = a.mass >= b.mass ? a : b
        const small = big === a ? b : a
        const m = big.mass + small.mass
        big.vx = (big.vx * big.mass + small.vx * small.mass) / m
        big.vy = (big.vy * big.mass + small.vy * small.mass) / m
        // Centre of mass position.
        big.x = (big.x * big.mass + small.x * small.mass) / m
        big.y = (big.y * big.mass + small.y * small.mass) / m
        big.mass = m
        big.haloMass += small.haloMass
        big.radiusMeters = physicalRadiusMeters(big.mass - big.haloMass, big.type, big.subType)
        small.alive = false
    }

    resolveBounce(a: Body, b: Body, dx: number, dy: number, dist: number): void {
        // Elastic 2-body collision response (equal restitution).
        if (dist === 0) dist = 0.001
        const nx = dx / dist
        const ny = dy / dist
        const rvx = b.vx - a.vx
        const rvy = b.vy - a.vy
        const vn = rvx * nx + rvy * ny
        if (vn > 0) return // already separating
        const imp = (2 * vn) / (a.mass + b.mass)
        a.vx += imp * b.mass * nx
        a.vy += imp * b.mass * ny
        b.vx -= imp * a.mass * nx
        b.vy -= imp * a.mass * ny
        // Positional correction so they don't stay overlapped.
        const overlap = a.worldRadius(this.metersPerPixel) + b.worldRadius(this.metersPerPixel) - dist
        a.x -= nx * overlap * 0.5
        a.y -= ny * overlap * 0.5
        b.x += nx * overlap * 0.5
        b.y += ny * overlap * 0.5
    }

    bounceWalls(): void {
        // Reflect off the edges of the currently visible world rectangle.
        const [left, top] = this.toWorld(0, 0)
        const [right, bottom] = this.toWorld(this.view.w, this.view.h)
        for (const b of this.bodies) {
            const r = b.worldRadius(this.metersPerPixel)
            if (b.x - r < left) {
                b.x = left + r
                b.vx = Math.abs(b.vx)
            }
            if (b.x + r > right) {
                b.x = right - r
                b.vx = -Math.abs(b.vx)
            }
            if (b.y - r < top) {
                b.y = top + r
                b.vy = Math.abs(b.vy)
            }
            if (b.y + r > bottom) {
                b.y = bottom - r
                b.vy = -Math.abs(b.vy)
            }
        }
    }

    totalEnergy(): number {
        let ke = 0
        for (const b of this.bodies) {
            ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy)
        }
        return ke
    }
}
