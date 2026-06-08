// Maps between the simulation's internal (dimensionless) "raw" mass and the
// physical units shown in the UI.
//
// One fixed raw->mass scale is shared by both units, so they stay physically
// proportional: 1 M☉ = EARTH_MASSES_PER_SOLAR_MASS (~333,000) M⊕.
//   - Planets are expressed in Earth masses (M⊕)
//   - Stars and black holes are expressed in solar masses (M☉)
import type { BodyType, BodySubtype, PlanetSubtype, StarSubtype, EvolvedStar } from './types'
import { EVOLVED_STAR_DENSITY } from './physics'

// Real astronomical ratio: 1 solar mass ≈ 333,000 Earth masses.
const EARTH_MASSES_PER_SOLAR_MASS = 332_946

// Anchor: one raw mass unit in solar masses (raw 2400 ≈ 1 M☉). The Earth-mass
// factor is derived from the real ratio above, keeping the two proportional.
const SOLAR_PER_RAW = 1 / 2400
export const EARTH_PER_RAW = SOLAR_PER_RAW * EARTH_MASSES_PER_SOLAR_MASS

// ---- SI scaling -----------------------------------------------------------
// The engine integrates with G = 1 in self-consistent "sim units". Choosing a
// length scale (metres per pixel) plus the already-fixed mass scale below pins
// the time scale via Kepler's relation  T = sqrt(L³ / (G·M))  — you can only
// pick two of {length, mass, time}; gravity fixes the third.
const G_SI = 6.674e-11 // m³ kg⁻¹ s⁻²
const SOLAR_MASS_KG = 1.98892e30
const KG_PER_RAW = SOLAR_MASS_KG * SOLAR_PER_RAW // kg per raw mass unit (fixed)

export const AU_M = 1.495978707e11
export const LY_M = 9.4607e15
export const DAY_S = 86_400
export const YEAR_S = 365.25 * DAY_S
const C_MS = 2.99792458e8 // speed of light

// Adjustable length scale: metres represented by one pixel (at zoom 1).
export const SCALE_RANGE = { min: 1e6, max: 1e20, default: AU_M }

// Playback speed = seconds of simulated time advanced per real second.
// The minimum and default are fixed; the maximum is scale-dependent (see
// maxStableSpeed) because tighter scales can't be integrated as fast.
export const SPEED_RANGE = { min: 1, default: 50 * YEAR_S }

// Integrator stability bounds, shared with the sim loop. Each substep advances
// at most MAX_SUBSTEP_DT of sim-time; a frame uses at most MAX_SUBSTEPS of them.
export const MAX_SUBSTEP_DT = 0.1
export const MAX_SUBSTEPS = 400

// Fastest playback (sim-seconds per real second) that stays stable at a given
// length scale, assuming ~60 fps. Beyond this a frame would need more than
// MAX_SUBSTEPS substeps, so the rate can't actually increase.
export const maxStableSpeed = (metersPerPixel: number): number =>
    MAX_SUBSTEPS * MAX_SUBSTEP_DT * secondsPerSimTime(metersPerPixel) * 60

// Log mapping of the speed slider (0–1) onto [min, maxSpeed] for the scale.
export const speedToSlider = (v: number, maxSpeed: number): number => {
    return Math.log(v / SPEED_RANGE.min) / Math.log(maxSpeed / SPEED_RANGE.min)
}

export const sliderToSpeed = (t: number, maxSpeed: number): number => {
    return SPEED_RANGE.min * Math.pow(maxSpeed / SPEED_RANGE.min, t)
}

// Densities used to estimate a body's physical radius from its mass (kg/m³).
const PLANET_DENSITY = 5514 // Earth-like
const STAR_DENSITY = 1408 // Sun-like
// Pixel floor so a body stays visible/clickable even when physically sub-pixel.
const MIN_WORLD_RADIUS = 1.5
// When a body is sub-pixel, the floor is raised by how close it is to being
// resolvable, so relative size still reads (the Sun looks bigger than the
// planets) — but a body that's sub-pixel by many orders of magnitude (a star
// seen across a galaxy) gets no boost and stays a point.
const FLOOR_BOOST_ORDERS = 3.5 // boost applies within this many orders of magnitude of the floor
const FLOOR_BOOST_GAIN = 2 // extra pixels of floor per order of magnitude within that window

// A body's true physical radius in metres, from its mass, type, and subtype.
export const physicalRadiusMeters = (massRaw: number, type: BodyType, subtype?: BodySubtype): number => {
    const kg = massRaw * KG_PER_RAW
    // Black holes: event-horizon (Schwarzschild) radius.
    if (type === 'blackhole') return (2 * G_SI * kg) / (C_MS * C_MS)
    // Stars / planets: sphere of the assumed mean density. Evolved stars (white
    // dwarf, red giant, neutron star) have their own density so their radius
    // is decoupled from the main-sequence mass-radius relation.
    let density: number
    if (subtype && subtype in EVOLVED_STAR_DENSITY) {
        density = EVOLVED_STAR_DENSITY[subtype as EvolvedStar]
    } else {
        density = type === 'star' ? STAR_DENSITY : PLANET_DENSITY
    }
    return Math.cbrt((3 * kg) / (4 * Math.PI * density))
}

// Physical radius -> on-screen world radius (pixels at zoom 1) for a scale.
// Above the floor the size is exactly physical (so it tracks zoom/scale). Below
// it, the floor is logarithmically raised toward resolvability, keeping relative
// scale legible without bloating bodies that are sub-pixel by many orders of magnitude.
export const worldRadius = (radiusMeters: number, metersPerPixel: number): number => {
    const physical = radiusMeters / metersPerPixel
    const ordersBelowFloor = Math.log10(MIN_WORLD_RADIUS / physical)
    const floor = MIN_WORLD_RADIUS + Math.pow(FLOOR_BOOST_GAIN, Math.max(0, FLOOR_BOOST_ORDERS - ordersBelowFloor)) - 1
    return Math.max(physical, floor)
}

export const SCALE_PRESETS: [string, number][] = [
    ['100k km', 1e8],
    ['1 AU', AU_M],
    ['0.1 ly', 0.1 * LY_M],
    ['1 ly', LY_M],
]

// Seconds of simulated time per sim-time unit, derived from the length scale.
export const secondsPerSimTime = (metersPerPixel: number): number => {
    return Math.sqrt(Math.pow(metersPerPixel, 3) / (G_SI * KG_PER_RAW))
}

// Conversion of a sim velocity (pixels / sim-time) into metres per second.
const metersPerSecondPerSimVel = (metersPerPixel: number): number => {
    return metersPerPixel / secondsPerSimTime(metersPerPixel)
}

export const scaleToSlider = (metersPerPixel: number): number => {
    const { min, max } = SCALE_RANGE
    return Math.log(metersPerPixel / min) / Math.log(max / min)
}

export const sliderToScale = (t: number): number => {
    const { min, max } = SCALE_RANGE
    return min * Math.pow(max / min, t)
}

export const formatLength = (m: number): string => {
    if (m >= 0.5 * LY_M) return (m / LY_M).toFixed(2) + ' ly'
    if (m >= 0.1 * AU_M) return (m / AU_M).toFixed(2) + ' AU'
    if (m >= 1e3) return Math.round(m / 1e3).toLocaleString() + ' km'
    return m.toFixed(0) + ' m'
}

export const formatScale = (metersPerPixel: number): string => {
    return `1 px = ${formatLength(metersPerPixel)}`
}

const formatDuration = (s: number): string => {
    if (s <= 0) return '0 s'
    if (s >= 1e9 * YEAR_S) return (s / (1e9 * YEAR_S)).toFixed(1) + ' Gyr'
    if (s >= 1e6 * YEAR_S) return (s / (1e6 * YEAR_S)).toFixed(1) + ' Myr'
    if (s >= 1e3 * YEAR_S) return (s / (1e3 * YEAR_S)).toFixed(1) + ' kyr'
    if (s >= YEAR_S) return (s / YEAR_S).toFixed(1) + ' yr'
    if (s >= DAY_S) return (s / DAY_S).toFixed(1) + ' d'
    if (s >= 3600) return (s / 3600).toFixed(1) + ' h'
    if (s >= 60) return (s / 60).toFixed(1) + ' min'
    return s.toFixed(1) + ' s'
}

// Selectable mass range per body type, expressed in that type's display unit.
export const MASS_RANGES: Record<BodyType, { min: number; max: number; default: number }> = {
    planet: { min: 0.1, max: 1_000, default: 1 }, // Earth masses
    star: { min: 0.1, max: 250, default: 1 }, // solar masses
    blackhole: { min: 1, max: 1_000_000_000, default: 1_000 }, // solar masses
}

export const massUnit = (type: BodyType): string => {
    return type === 'planet' ? 'M⊕' : 'M☉'
}

// Physical display value (in the type's unit) -> engine raw mass.
export const displayToRaw = (value: number, type: BodyType): number => {
    return type === 'planet' ? value / EARTH_PER_RAW : value / SOLAR_PER_RAW
}

// Engine raw mass -> physical display value (in the type's unit).
export const rawToDisplay = (raw: number, type: BodyType): number => {
    return type === 'planet' ? raw * EARTH_PER_RAW : raw * SOLAR_PER_RAW
}

export const typeLabel = (type: BodyType): string => {
    return type === 'blackhole' ? 'Black hole' : type[0].toUpperCase() + type.slice(1)
}

// Human-readable label including the subtype, e.g. 'Gas giant', 'G-type star',
// 'White dwarf'. Single-letter subtypes are main-sequence spectral classes.
export const subtypeLabel = (type: BodyType, subtype: BodySubtype | undefined): string => {
    if (type === 'planet') return subtype === 'gasGiant' ? 'Gas giant' : 'Terrestrial planet'
    if (type === 'star') {
        if (!subtype) return 'Star'
        return subtype.length === 1 ? `${subtype}-type star` : subtypeShortLabel(subtype)
    }
    return 'Black hole'
}

// ---- Subtype selection (New Body panel) -----------------------------------
const PLANET_SUBTYPES: PlanetSubtype[] = ['terrestrial', 'gasGiant']
const STAR_SUBTYPES: StarSubtype[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'whiteDwarf', 'redGiant', 'neutronStar']

export const subtypesForType = (type: BodyType): BodySubtype[] =>
    type === 'planet' ? PLANET_SUBTYPES : type === 'star' ? STAR_SUBTYPES : []

// Default mass for each subtype, in that type's display unit (M⊕ / M☉).
export const SUBTYPE_DEFAULT_MASS: Record<BodySubtype, number> = {
    terrestrial: 1, // M⊕
    gasGiant: 25, // M⊕
    O: 30, // M☉ — representative main-sequence masses
    B: 5,
    A: 1.7,
    F: 1.2,
    G: 1,
    K: 0.7,
    M: 0.3,
    whiteDwarf: 0.6, // M☉ — typical evolved-state masses
    redGiant: 1.5,
    neutronStar: 1.4,
}

const SUBTYPE_SHORT: Record<BodySubtype, string> = {
    terrestrial: 'Terrestrial',
    gasGiant: 'Gas giant',
    O: 'O-type',
    B: 'B-type',
    A: 'A-type',
    F: 'F-type',
    G: 'G-type',
    K: 'K-type',
    M: 'M-type',
    whiteDwarf: 'White dwarf',
    redGiant: 'Red giant',
    neutronStar: 'Neutron star',
}
export const subtypeShortLabel = (s: BodySubtype): string => SUBTYPE_SHORT[s]

// Subtype to select when switching to a body type (black holes have none).
export const defaultSubtypeForType = (type: BodyType): BodySubtype | undefined =>
    type === 'planet' ? 'terrestrial' : type === 'star' ? 'G' : undefined

// ---- Logarithmic slider mapping (ranges span many orders of magnitude) ----
export const massToSlider = (value: number, type: BodyType): number => {
    const { min, max } = MASS_RANGES[type]
    return Math.log(value / min) / Math.log(max / min)
}

export const sliderToMass = (t: number, type: BodyType): number => {
    const { min, max } = MASS_RANGES[type]
    return min * Math.pow(max / min, t)
}

// Compact, readable rendering of a mass value (with magnitude suffix).
export const formatMassValue = (v: number): string => {
    if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + 'B'
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M'
    if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k'
    if (v >= 100) return v.toFixed(0)
    if (v >= 10) return v.toFixed(1)
    return v.toFixed(2)
}

// Mass with the unit appropriate to the body's type.
export const formatMass = (value: number, type: BodyType): string => {
    return `${formatMassValue(value)} ${massUnit(type)}`
}

// Total kinetic energy in real joules (depends on length scale via velocity).
export const formatEnergy = (rawKE: number, metersPerPixel: number): string => {
    const v = metersPerSecondPerSimVel(metersPerPixel)
    const joules = rawKE * KG_PER_RAW * v * v
    if (joules === 0) return '0 J'
    if (joules >= 1e4 || joules < 1e-2) return joules.toExponential(2) + ' J'
    if (joules >= 1e3) return (joules / 1e3).toFixed(1) + ' kJ'
    return Math.round(joules) + ' J'
}

// Playback speed expressed as simulated time elapsed per real second.
export const formatSpeed = (realSecondsPerSecond: number): string => {
    return formatDuration(realSecondsPerSecond) + '/s'
}

// Velocity magnitude in real units (m/s, km/s, or fraction of c).
export const formatVelocity = (vSim: number, metersPerPixel: number): string => {
    const mps = vSim * metersPerSecondPerSimVel(metersPerPixel)
    if (mps >= 0.01 * C_MS) return (mps / C_MS).toFixed(4) + ' c'
    if (mps >= 1e3) return (mps / 1e3).toFixed(mps >= 1e6 ? 0 : 1) + ' km/s'
    return mps.toFixed(1) + ' m/s'
}
