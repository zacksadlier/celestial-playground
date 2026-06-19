// Central home for the project's fixed constants (physical scales, integrator
// tuning, body density/colour tables, and small UI knobs). Pure values only, so
// any module can import from here without pulling in the engine or the UI.
import type { BodyType, BodySubtype, PlanetSubtype, StarSubtype, EvolvedStar } from './types'

// ---- Mass scale -----------------------------------------------------------
// One fixed raw->mass scale is shared by both display units, so they stay
// physically proportional: 1 M☉ = EARTH_MASSES_PER_SOLAR_MASS (~333,000) M⊕.
export const EARTH_MASSES_PER_SOLAR_MASS = 332_946
// Anchor: one raw mass unit in solar masses (raw 2400 ≈ 1 M☉). The Earth-mass
// factor is derived from the real ratio above, keeping the two proportional.
export const SOLAR_PER_RAW = 1 / 2400
export const EARTH_PER_RAW = SOLAR_PER_RAW * EARTH_MASSES_PER_SOLAR_MASS

// ---- SI scaling -----------------------------------------------------------
export const G_SI = 6.674e-11 // m³ kg⁻¹ s⁻²
export const SOLAR_MASS_KG = 1.98892e30
export const KG_PER_RAW = SOLAR_MASS_KG * SOLAR_PER_RAW // kg per raw mass unit (fixed)

export const AU_M = 1.495978707e11
export const LY_M = 9.4607e15
export const DAY_S = 86_400
export const YEAR_S = 365.25 * DAY_S
export const C_MS = 2.99792458e8 // speed of light

// Adjustable length scale: metres represented by one pixel (at zoom 1).
export const SCALE_RANGE = { min: 1e6, max: 1000 * LY_M, default: AU_M }

// Playback speed = seconds of simulated time advanced per real second. The
// minimum and default are fixed; the maximum is scale-dependent (see
// maxStableSpeed) because tighter scales can't be integrated as fast.
export const SPEED_RANGE = { min: 1, default: 50 * YEAR_S }

// ---- Integrator stability -------------------------------------------------
// Each substep advances at most MAX_SUBSTEP_DT of sim-time; a frame uses at most
// MAX_SUBSTEPS of them. STABILITY_ETA is the safety factor on the dynamical time
// of the most strongly-interacting pair, so a step never crosses much of a tight
// orbit (which would make the integrator fling bodies past each other).
export const MAX_SUBSTEP_DT = 0.1
export const MAX_SUBSTEPS = 400
export const STABILITY_ETA = 0.15

// ---- Body sizing ----------------------------------------------------------
// Densities used to estimate a body's physical radius from its mass (kg/m³).
export const PLANET_DENSITY = 5514 // Earth-like
export const STAR_DENSITY = 1408 // Sun-like
// Pixel floor so a body stays visible/clickable even when physically sub-pixel.
export const MIN_WORLD_RADIUS = 1.5
// When a body is sub-pixel, the floor is raised by how close it is to being
// resolvable, so relative size still reads, but a body that's sub-pixel by many
// orders of magnitude (a star seen across a galaxy) gets no boost and stays a point.
export const FLOOR_BOOST_ORDERS = 3.5 // boost applies within this many orders of magnitude of the floor
export const FLOOR_BOOST_GAIN = 2 // extra pixels of floor per order of magnitude within that window

// Mean density (kg/m³) for evolved stars, whose radius is decoupled from mass.
// Chosen so the canonical mass gives the real size: white dwarf ≈ Earth-sized,
// neutron star ≈ 11 km, red giant ≈ 50 R☉.
export const EVOLVED_STAR_DENSITY: Record<EvolvedStar, number> = {
    whiteDwarf: 1e9,
    redGiant: 0.011,
    neutronStar: 5e17,
}

// Red dwarfs are far denser than the Sun (~0.2 M☉ packed into ~0.2 R☉), so they
// get their own mean density rather than the Sun-like main-sequence value.
export const RED_DWARF_DENSITY = 30_000 // kg/m³

// ---- Length-scale quick picks (label, metres/pixel) -----------------------
export const SCALE_PRESETS: [string, number][] = [
    ['100k km', 1e8],
    ['1 AU', AU_M],
    ['0.1 ly', 0.1 * LY_M],
    ['1 ly', LY_M],
]

// ---- Mass selection (New Body panel) --------------------------------------
// Selectable mass range per body type, expressed in that type's display unit.
export const MASS_RANGES: Record<BodyType, { min: number; max: number; default: number }> = {
    planet: { min: 0.1, max: 1_000, default: 1 }, // Earth masses
    star: { min: 0.1, max: 250, default: 1 }, // solar masses
    blackhole: { min: 1, max: 1_000_000_000, default: 1_000 }, // solar masses
}

// subType options offered for each body type.
export const PLANET_SUBTYPES: PlanetSubtype[] = ['terrestrial', 'gasGiant']
export const STAR_SUBTYPES: StarSubtype[] = [
    'O',
    'B',
    'A',
    'F',
    'G',
    'K',
    'M',
    'redDwarf',
    'whiteDwarf',
    'redGiant',
    'neutronStar',
]

// Default mass for each subType, in that type's display unit (M⊕ / M☉).
export const SUBTYPE_DEFAULT_MASS: Record<BodySubtype, number> = {
    terrestrial: 1, // M⊕
    gasGiant: 25, // M⊕
    O: 30, // M☉ - representative main-sequence masses
    B: 5,
    A: 1.7,
    F: 1.2,
    G: 1,
    K: 0.7,
    M: 0.3,
    redDwarf: 0.2, // M☉ - low-mass, cool main-sequence star
    whiteDwarf: 0.6, // M☉ - typical evolved-state masses
    redGiant: 1.5,
    neutronStar: 1.4,
}

// Short human-readable label per subType.
export const SUBTYPE_SHORT: Record<BodySubtype, string> = {
    terrestrial: 'Terrestrial',
    gasGiant: 'Gas giant',
    O: 'O-type',
    B: 'B-type',
    A: 'A-type',
    F: 'F-type',
    G: 'G-type',
    K: 'K-type',
    M: 'M-type',
    redDwarf: 'Red dwarf',
    whiteDwarf: 'White dwarf',
    redGiant: 'Red giant',
    neutronStar: 'Neutron star',
}

// ---- Rendering ------------------------------------------------------------
// Characteristic colours for each subType (rough; tweak to taste). Stars get a
// few slight shade variants so identical classes don't all look the same.
export const SUBTYPE_COLORS: Record<BodySubtype, string[]> = {
    terrestrial: ['#9a8f86'], // rocky grey-brown
    gasGiant: ['#e0a868'], // tan / orange bands
    O: ['#9bb0ff', '#8fa6ff', '#a7baff'], // blue
    B: ['#b7c6ff', '#aabcff', '#c2cfff'], // blue-white
    A: ['#dbe4ff', '#d0dbff', '#e4ebff'], // white
    F: ['#f7f4ec', '#fbf8f1', '#f2ede0'], // yellow-white
    G: ['#ffe9a8', '#ffe399', '#ffefbc'], // yellow (Sun-like)
    K: ['#ffc079', '#ffb868', '#ffca8e'], // orange
    M: ['#ff8a5c', '#ff7e4d', '#ff9870'], // red-orange
    redDwarf: ['#f4593a', '#e64a2e', '#ff6b4a'], // deep, cool red
    whiteDwarf: ['#dbe9ff', '#cfe1ff', '#e6f0ff'], // hot blue-white
    redGiant: ['#ff6a4a', '#ff5c3a', '#ff7a5e'], // cool, luminous red-orange
    neutronStar: ['#bcd4ff', '#aecbff', '#cadeff'], // intense blue-white
}

// Fallback palette for bodies without a subType-derived colour.
export const PALETTE = [
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

// ---- Engine limits --------------------------------------------------------
// Hard cap on the number of bodies. Gravity is exact O(n²); beyond this the
// per-frame cost isn't worth it, so further additions are simply ignored.
export const MAX_BODIES = 1000
// Above this body count, collisions use a sweep-and-prune broad phase instead
// of the exact O(n²) all-pairs scan.
export const COLLISION_BROADPHASE_AT = 256

// ---- Presets --------------------------------------------------------------
// Main-sequence classes used when a scene picks a random star.
export const MAIN_SEQUENCE: StarSubtype[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M']
// Evolved/compact stars that can also anchor a random system.
export const EVOLVED_STARS: StarSubtype[] = ['whiteDwarf', 'redGiant', 'neutronStar']
// Spreads starting phases so orbits in a scene don't all begin aligned.
export const GOLDEN = 2.39996323
// Plummer softening length used by the engine's gravity (mirrors Simulation.softening).
export const SOFTENING = 6

// ---- Interaction / UI -----------------------------------------------------
// Launch responsiveness: ~fraction of the drag's screen length the body drifts per second.
export const VELOCITY_SCALE = 0.6
// Pixel size of toolbar icons.
export const ICON_SIZE = 16
