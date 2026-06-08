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
export type StarSubtype = MainSequenceClass | EvolvedStar
export type BodySubtype = PlanetSubtype | StarSubtype

export interface BodyOptions {
    x: number
    y: number
    vx?: number
    vy?: number
    mass?: number
    color?: string
    type?: BodyType
    subtype?: BodySubtype
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
    subtype: BodySubtype | undefined
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
    x: number
    y: number
}

export interface Actions {
    togglePlay: () => void
    step: () => void
    clear: () => void
    zoomIn: () => void
    zoomOut: () => void
    resetView: () => void
    toggleMeasure: () => void
}
