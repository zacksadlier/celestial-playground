// Maps between the simulation's internal (dimensionless) "raw" mass and the
// physical units shown in the UI, plus scale/format helpers. The fixed values
// these functions use live in ./constants.
//   - Planets are expressed in Earth masses (M⊕)
//   - Stars and black holes are expressed in solar masses (M☉)
import type { BodyType, BodySubtype, EvolvedStar } from './types'
import {
    EARTH_PER_RAW,
    SOLAR_PER_RAW,
    G_SI,
    KG_PER_RAW,
    C_MS,
    AU_M,
    LY_M,
    DAY_S,
    YEAR_S,
    SCALE_RANGE,
    SPEED_RANGE,
    MAX_SUBSTEP_DT,
    MAX_SUBSTEPS,
    PLANET_DENSITY,
    STAR_DENSITY,
    RED_DWARF_DENSITY,
    MIN_WORLD_RADIUS,
    FLOOR_BOOST_ORDERS,
    FLOOR_BOOST_GAIN,
    MASS_RANGES,
    PLANET_SUBTYPES,
    STAR_SUBTYPES,
    SUBTYPE_SHORT,
    EVOLVED_STAR_DENSITY,
} from './constants'

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

// A body's true physical radius in metres, from its mass, type, and subType.
export const physicalRadiusMeters = (massRaw: number, type: BodyType, subType?: BodySubtype): number => {
    const kg = massRaw * KG_PER_RAW
    // Black holes: event-horizon (Schwarzschild) radius.
    if (type === 'blackhole') return (2 * G_SI * kg) / (C_MS * C_MS)
    // Stars / planets: sphere of the assumed mean density. Evolved stars (white
    // dwarf, red giant, neutron star) have their own density so their radius
    // is decoupled from the main-sequence mass-radius relation.
    let density: number
    if (subType && subType in EVOLVED_STAR_DENSITY) {
        density = EVOLVED_STAR_DENSITY[subType as EvolvedStar]
    } else if (subType === 'redDwarf') {
        density = RED_DWARF_DENSITY
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

// Seconds of simulated time per sim-time unit, derived from the length scale.
export const secondsPerSimTime = (metersPerPixel: number): number => {
    return Math.sqrt(Math.pow(metersPerPixel, 3) / (G_SI * KG_PER_RAW))
}

// Conversion of a sim velocity (pixels / sim-time) into metres per second.
const metersPerSecondPerSimVel = (metersPerPixel: number): number => {
    return metersPerPixel / secondsPerSimTime(metersPerPixel)
}

// The speed of light expressed as a sim velocity at the given length scale.
export const lightSpeedSimVel = (metersPerPixel: number): number => {
    return C_MS / metersPerSecondPerSimVel(metersPerPixel)
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

export const formatDuration = (s: number): string => {
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

// Human-readable label including the subType, e.g. 'Gas giant', 'G-type star',
// 'White dwarf'. Single-letter subtypes are main-sequence spectral classes.
export const subtypeLabel = (type: BodyType, subType: BodySubtype | undefined): string => {
    if (type === 'planet') return subType === 'gasGiant' ? 'Gas giant' : 'Terrestrial planet'
    if (type === 'star') {
        if (!subType) return 'Star'
        return subType.length === 1 ? `${subType}-type star` : subtypeShortLabel(subType)
    }
    return 'Black hole'
}

export const subtypesForType = (type: BodyType): BodySubtype[] =>
    type === 'planet' ? PLANET_SUBTYPES : type === 'star' ? STAR_SUBTYPES : []

export const subtypeShortLabel = (s: BodySubtype): string => SUBTYPE_SHORT[s]

// subType to select when switching to a body type (black holes have none).
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

// Newtonian attraction between two bodies (pairwise only), in newtons.
export const gravitationalForceN = (massRawA: number, massRawB: number, distMeters: number): number => {
    if (distMeters <= 0) return 0
    return (G_SI * massRawA * KG_PER_RAW * (massRawB * KG_PER_RAW)) / Math.pow(distMeters, 2)
}

export const formatForce = (newtons: number): string => {
    if (newtons === 0) return '0 N'
    if (newtons >= 1e4 || newtons < 1e-2) return newtons.toExponential(2) + ' N'
    if (newtons >= 1e3) return (newtons / 1e3).toFixed(1) + ' kN'
    return newtons.toFixed(newtons >= 10 ? 0 : 2) + ' N'
}

// Playback speed expressed as simulated time elapsed per real second.
export const formatSpeed = (realSecondsPerSecond: number): string => {
    return formatDuration(realSecondsPerSecond) + '/s'
}

// Velocity magnitude in real units (m/s, km/s, or fraction of c).
export const formatVelocity = (vSim: number, metersPerPixel: number): string => {
    const mps = vSim * metersPerSecondPerSimVel(metersPerPixel)
    if (mps >= 0.01 * C_MS) return Math.min(1, mps / C_MS).toFixed(4) + ' c'
    if (mps >= 1e3) return (mps / 1e3).toFixed(mps >= 1e6 ? 0 : 1) + ' km/s'
    return mps.toFixed(1) + ' m/s'
}
