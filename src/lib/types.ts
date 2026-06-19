// Shared type definitions. Pure types only (no runtime/class dependencies), so
// any module can import from here without pulling in the engine.

// ---- Body classification --------------------------------------------------
export type BodyType = 'planet' | 'star' | 'blackhole'
export type BodyKind = BodyType

// Subtypes within a body type. Planets split by composition; stars by a rough
// main-sequence spectral class (O hottest/bluest → M coolest/reddest), plus
// three evolved/compact states whose size is set independently of mass.
export type PlanetSubtype = 'terrestrial' | 'gasGiant'
export type MainSequenceClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'
export type EvolvedStar = 'whiteDwarf' | 'redGiant' | 'neutronStar'
// A red dwarf is a small, cool, low-mass main-sequence star (not evolved); it gets
// its own subtype so it can be picked and styled distinctly from a generic M-type.
export type StarSubtype = MainSequenceClass | EvolvedStar | 'redDwarf'
export type BodySubtype = PlanetSubtype | StarSubtype

export interface BodyOptions {
    x: number
    y: number
    vx?: number
    vy?: number
    mass?: number
    color?: string
    type?: BodyType
    subType?: BodySubtype
    haloMass?: number
}

// ---- Simulation -----------------------------------------------------------
export interface SimSettings {
    G: number
    speed: number
    trails: boolean
    merge: boolean
    elastic: boolean
}

export interface Camera {
    x: number
    y: number
    zoom: number
}

// ---- UI-facing ------------------------------------------------------------
export interface NewBodyConfig {
    mass: number
    type: BodyType
    subType: BodySubtype | undefined
    randomColor: boolean
}

export interface Stats {
    bodies: number
    energy: number
    fps: number
}

export interface TooltipInfo {
    label: string
    mass: string
    halo?: string // dark-matter-halo mass, shown separately when present
    velocity: string
    orbit?: OrbitTooltip // present only when the body is bound to a heavier primary
    pinned?: boolean // true when this tooltip is pinned (persists after a click)
    x: number
    y: number
}

// Pre-formatted orbital elements for display when a body is orbiting another.
export interface OrbitTooltip {
    parent: string // label of the body being orbited
    period: string
    semiMajor: string
    eccentricity: string
    periapsis: string
    apoapsis: string
}

// How a left click/drag on the canvas is interpreted.
//   body    - add/launch bodies (the default)
//   pan     - drag to move the view
//   measure - drag a ruler / pick bodies to measure between
export type InteractionMode = 'body' | 'pan' | 'measure'

export interface Actions {
    togglePlay: () => void
    step: () => void
    clear: () => void
    zoomIn: () => void
    zoomOut: () => void
    resetView: () => void
    setMode: (mode: InteractionMode) => void
}
