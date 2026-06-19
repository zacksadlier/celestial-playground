// Scene presets. Each returns its bodies (positioned around world origin) plus
// the length scale (metres/pixel) and playback speed (simulated seconds per real
// second) that frame and pace it best. Presets take per-scene options chosen in
// the panel before the scene is built.
import { Body, randomColor } from './physics'
import type { StarSubtype, PlanetSubtype } from './lib/types'
import { displayToRaw, secondsPerSimTime } from './lib/units'
import {
    EARTH_PER_RAW,
    AU_M,
    LY_M,
    DAY_S,
    YEAR_S,
    SUBTYPE_DEFAULT_MASS,
    MAIN_SEQUENCE,
    EVOLVED_STARS,
    GOLDEN,
    SOFTENING,
} from './lib/constants'

export type PresetName = 'binary' | 'solar' | 'cluster' | 'collision'

export interface PresetScene {
    bodies: Body[]
    metersPerPixel: number
    speed: number
}

// ---- Per-preset options ---------------------------------------------------
export interface BinaryOptions {
    starA: StarSubtype
    starB: StarSubtype
}
export interface SolarOptions {
    mode: 'ours' | 'random' | 'alphaCentauri'
}
export interface ClusterOptions {
    count: number // 5–100 bodies
}
export interface CollisionOptions {
    starsPerGalaxy: number // 50–500 per galaxy
}

export interface PresetOptions {
    binary: BinaryOptions
    solar: SolarOptions
    cluster: ClusterOptions
    collision: CollisionOptions
}

export const DEFAULT_PRESET_OPTIONS: PresetOptions = {
    binary: { starA: 'G', starB: 'A' },
    solar: { mode: 'ours' },
    cluster: { count: 60 },
    collision: { starsPerGalaxy: 200 },
}

// Pick a random central star - usually main-sequence, occasionally evolved.
const randomStarType = (): StarSubtype => {
    const pool = Math.random() < 0.25 ? EVOLVED_STARS : MAIN_SEQUENCE
    return pool[(Math.random() * pool.length) | 0]
}

// Circular-orbit velocity for a small body around a central mass at radius r.
const orbitalSpeed = (G: number, centralMass: number, r: number): number => {
    return Math.sqrt((G * centralMass) / r)
}

// Circular-orbit velocity that accounts for the engine's softened gravity. The
// real acceleration is G·M·r / (r²+s²)^1.5, so close-in orbits need a *lower*
// speed than the bare Keplerian value - using the bare value leaves a tight orbit
// moving too fast for the (softened) force holding it, and it unbinds.
const softenedOrbitalSpeed = (G: number, centralMass: number, r: number): number => {
    return r * Math.sqrt((G * centralMass) / Math.pow(r * r + SOFTENING * SOFTENING, 1.5))
}

const starRaw = (s: StarSubtype): number => displayToRaw(SUBTYPE_DEFAULT_MASS[s], 'star')

type PresetFactories = {
    [K in PresetName]: (G: number, options: PresetOptions[K]) => PresetScene
}

export const presets: PresetFactories = {
    binary: (G, o) => {
        const rawA = starRaw(o.starA)
        const rawB = starRaw(o.starB)
        const M = rawA + rawB
        const D = 300 // separation in px
        const r1 = (rawB / M) * D // distance of A from the barycentre
        const r2 = (rawA / M) * D
        const vrel = Math.sqrt((G * M) / D)
        const v1 = (rawB / M) * vrel
        const v2 = (rawA / M) * vrel

        const bodies = [
            new Body({ x: -r1, y: 0, vx: 0, vy: -v1, mass: rawA, type: 'star', subType: o.starA }),
            new Body({ x: r2, y: 0, vx: 0, vy: v2, mass: rawB, type: 'star', subType: o.starB }),
        ]

        // Frame so the larger star spans ~20 px; pace so an orbit takes ~8 s.
        const maxR = Math.max(bodies[0].radiusMeters, bodies[1].radiusMeters)
        const metersPerPixel = Math.max(maxR / 20, 1e4)
        const periodSim = (2 * Math.PI * D) / vrel
        const speed = (periodSim * secondsPerSimTime(metersPerPixel)) / 8
        return { bodies, metersPerPixel, speed }
    },
    solar: (G, o) => {
        switch(o.mode) {
            case 'random':
                return randomSystem(G)
            case 'alphaCentauri':
                return alphaCentauriSystem(G)
            case 'ours':
                return ourSystem(G)
            default:
                console.log(`Unknown solar system preset detected: ${o.mode}`)
                return { bodies: [], metersPerPixel: 1, speed: 1 }
        }
    },
    cluster: (_, o) => {
        const bodies: Body[] = []
        // Any star class (main-sequence or evolved) can appear alongside planets.
        const STAR_TYPES: StarSubtype[] = [...MAIN_SEQUENCE, ...EVOLVED_STARS]
        const MIN_SEP = 45 // px between body centres
        const placed: { x: number; y: number }[] = []
        for (let i = 0; i < o.count; i++) {
            // Rejection-sample positions so bodies start with breathing room;
            // after a few misses keep the last candidate (dense, large counts).
            let x = 0
            let y = 0
            for (let attempt = 0; attempt < 20; attempt++) {
                const ang = Math.random() * Math.PI * 2
                const rad = Math.random() * 420 + 40
                x = Math.cos(ang) * rad
                y = Math.sin(ang) * rad
                if (placed.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= MIN_SEP * MIN_SEP)) break
            }
            placed.push({ x, y })

            const isStar = Math.random() < 0.35
            const subType = isStar ? STAR_TYPES[(Math.random() * STAR_TYPES.length) | 0] : undefined
            bodies.push(
                new Body({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 300,
                    vy: (Math.random() - 0.5) * 300,
                    // Stars get their class's canonical mass (±20%); planets keep
                    // the original light masses.
                    mass: subType ? starRaw(subType) * (0.8 + Math.random() * 0.4) : Math.random() * 80 + 15,
                    type: isStar ? 'star' : 'planet',
                    subType,
                    color: isStar ? undefined : randomColor(),
                }),
            )
        }
        return { bodies, metersPerPixel: 1e10, speed: 10 * DAY_S }
    },

    collision: (G, o) => {
        const bodies: Body[] = []
        const WARM = ['#ffd27a', '#ff9b6b', '#ffb38b', '#ff8bba']
        const COOL = ['#7aa2ff', '#7ae0ff', '#8bffd6', '#c08bff']
        const pick = (palette: string[]) => palette[(Math.random() * palette.length) | 0]

        // Length scale anchored so 50,000 ly maps to ~400 px (1 px ≈ 125 ly). Each
        // galaxy's disc radius is then a random 48,000–52,000 ly, converted to px.
        const metersPerPixel = (50_000 * LY_M) / 400
        const galaxyRadiusPx = (): number => ((48_000 + Math.random() * 4_000) * LY_M) / metersPerPixel

        const makeGalaxy = (
            cx: number,
            cy: number,
            vx: number,
            vy: number,
            coreColor: string,
            palette: string[],
            outerRadius: number,
        ): void => {
            const innerRadius = outerRadius * 0.05
            const stars: { rad: number; ang: number; mass: number }[] = []
            for (let i = 0; i < o.starsPerGalaxy; i++) {
                stars.push({
                    rad: Math.random() * (outerRadius - innerRadius) + innerRadius,
                    ang: Math.random() * Math.PI * 2,
                    mass: Math.random() * 2 * 2400, // ~0–2 M☉
                })
            }
            stars.sort((a, b) => a.rad - b.rad)

            // A realistic central supermassive black hole (random 10M–100M M☉)
            // plus a dark-matter halo add-on (~1e11 M☉). The halo provides the
            // gravity that drives realistic rotation (~200 km/s) and merger times.
            const bhMass = 2400 * (1e7 + Math.random() * 9e7)
            const haloMass = 2400 * 1e11
            const coreMass = bhMass + haloMass
            bodies.push(
                new Body({ x: cx, y: cy, vx, vy, mass: coreMass, haloMass, type: 'blackhole', color: coreColor }),
            )

            // Circular speed from the mass enclosed within each star's radius.
            let enclosed = coreMass
            for (const s of stars) {
                const v = Math.sqrt((G * enclosed) / s.rad)

                // Small chance to convert star to an evolved star
                let subType: StarSubtype | undefined
                if (Math.random() < 0.05) {
                    subType = EVOLVED_STARS[(Math.random() * EVOLVED_STARS.length) | 0]
                    s.mass = starRaw(subType)
                }

                enclosed += s.mass // mass interior to the next (larger-radius) star
                bodies.push(
                    new Body({
                        x: cx + Math.cos(s.ang) * s.rad,
                        y: cy + Math.sin(s.ang) * s.rad,
                        vx: vx - Math.sin(s.ang) * v,
                        vy: vy + Math.cos(s.ang) * v,
                        mass: s.mass,
                        type: 'star',
                        subType,
                        color: pick(palette),
                    }),
                )
            }
        }

        // Gentle approach (well under mutual escape velocity) so the galaxies stay
        // bound and merge rather than scattering apart on a hyperbolic flyby.
        makeGalaxy(-480, -200, 3, 1.4, '#c08bff', COOL, galaxyRadiusPx())
        makeGalaxy(480, 200, -3, -1.4, '#7ae0ff', WARM, galaxyRadiusPx())
        return { bodies, metersPerPixel, speed: 1e7 * YEAR_S } // ~20 Myr/s
    },
}

// ---- Solar-system variants ------------------------------------------------
const ourSystem = (G: number): PresetScene => {
    const sun = new Body({ x: 0, y: 0, mass: 2400, type: 'star', subType: 'G', color: '#ffd27a' }) // 1 M☉
    const bodies: Body[] = [sun]

    // The eight planets at their real semi-major axes (AU) and masses (M⊕). Inner
    // system to true scale; gas giants pulled inward so they stay on screen.
    const PX_PER_AU = 100
    const planets = [
        { a: 0.387, mass: 0.055, color: '#9a8f86' }, // Mercury
        { a: 0.723, mass: 0.815, color: '#d9c27a' }, // Venus
        { a: 1.0, mass: 1.0, color: '#6ab0ff' }, // Earth
        { a: 1.524, mass: 0.107, color: '#d9694a' }, // Mars
        { a: 5.203, mass: 317.8, color: '#e0a868' }, // Jupiter
        { a: 9.537, mass: 95.16, color: '#f0dca8' }, // Saturn
        { a: 19.19, mass: 14.54, color: '#a8e6ef' }, // Uranus
        { a: 30.07, mass: 17.15, color: '#4f6fd9' }, // Neptune
    ]
    const KNEE_AU = 1.6
    const OUTER_COMPRESS = 0.12
    const displayAU = (a: number) => (a <= KNEE_AU ? a : KNEE_AU + (a - KNEE_AU) * OUTER_COMPRESS)

    planets.forEach((p, i) => {
        const r = displayAU(p.a) * PX_PER_AU
        const ang = i * GOLDEN
        const v = orbitalSpeed(G, sun.mass, r)
        bodies.push(
            new Body({
                x: Math.cos(ang) * r,
                y: Math.sin(ang) * r,
                vx: -Math.sin(ang) * v,
                vy: Math.cos(ang) * v,
                mass: p.mass / EARTH_PER_RAW,
                type: 'planet',
                color: p.color,
            }),
        )
    })
    return { bodies, metersPerPixel: AU_M / PX_PER_AU, speed: 0.15 * YEAR_S }
}

// Alpha Centauri: the Sun's nearest stellar neighbour and a true triple system -
// a close, eccentric binary (Sun-like G-star A and orange K-star B) circled at a
// vast distance by the faint red dwarf Proxima Centauri, which carries its own
// planets. The real spacings span four orders of magnitude (A–B sit ~23 AU apart
// while Proxima lies ~13,000 AU out), so the outer distances are heavily
// compressed to keep all three stars - and Proxima's worlds - on screen at once.
//
// The compression can't be arbitrary, though: a hierarchical triple is only
// stable when the outer orbit sits well outside the inner binary (the
// Mardling-Aarseth criterion wants a_outer/a_inner ≳ 3 for these masses). So the
// binary is drawn at 1 px = 0.2 AU and Proxima kept far enough out (ratio ~3.8)
// that the hierarchy holds - while still leaving room for A's planet on a stable
// circumstellar orbit between the two stars.
const alphaCentauriSystem = (G: number): PresetScene => {
    const PX_PER_AU = 5
    const bodies: Body[] = []

    // Real masses (M☉): A is a G2V star, B a K1V star, Proxima an M5.5V red dwarf.
    const mA = displayToRaw(1.079, 'star')
    const mB = displayToRaw(0.909, 'star')
    const mProx = displayToRaw(0.122, 'star')
    const mAB = mA + mB

    // The A–B binary: a genuinely eccentric orbit (e≈0.52, a≈23.5 AU, ~80 yr). The
    // pair starts at apastron and swings inward, taking the vis-viva speed there so
    // the eccentricity reads in the motion rather than being a fixed circle. With
    // real AU and real masses this scale even reproduces the true ~80-year period.
    const E_AB = 0.52
    const aAB = 23.5 * PX_PER_AU
    const rAp = aAB * (1 + E_AB) // separation at apastron (starting point)
    const vRel = Math.sqrt(G * mAB * (2 / rAp - 1 / aAB)) // vis-viva relative speed
    const rA = (mB / mAB) * rAp // each star's distance from the shared barycentre
    const rB = (mA / mAB) * rAp
    const vA = (mB / mAB) * vRel
    const vB = (mA / mAB) * vRel
    const starA = new Body({ x: -rA, y: 0, vx: 0, vy: -vA, mass: mA, type: 'star', subType: 'G', color: '#fff1d0' })
    const starB = new Body({ x: rB, y: 0, vx: 0, vy: vB, mass: mB, type: 'star', subType: 'K', color: '#ffc079' })
    bodies.push(starA, starB)

    // Alpha Centauri A's confirmed planet: a gas giant on a ~2 AU orbit around A
    // (an S-type / circumstellar orbit). It's kept well inside A's stability limit
    // against B - the Holman-Wiegert critical radius is ~0.12·a_AB here - so the
    // binary can't strip it; the softened orbital speed keeps it near-circular.
    const rPlanetA = 10 // px = 2 AU at this scale
    const angPlanetA = 1.2
    const vPlanetA = softenedOrbitalSpeed(G, mA, rPlanetA)
    bodies.push(
        new Body({
            x: starA.x + Math.cos(angPlanetA) * rPlanetA,
            y: starA.y + Math.sin(angPlanetA) * rPlanetA,
            vx: starA.vx - Math.sin(angPlanetA) * vPlanetA,
            vy: starA.vy + Math.cos(angPlanetA) * vPlanetA,
            mass: 100 / EARTH_PER_RAW, // ~Saturn-mass gas giant
            type: 'planet',
            subType: 'gasGiant',
            color: '#d6b27a',
        }),
    )

    // Proxima Centauri: gravitationally bound to the A–B pair on a huge, slow orbit
    // (~13,000 AU, ~550,000 yr). Placed on a compressed circular orbit around the
    // barycentre, in the same sense as the binary, so it stays in frame.
    const rProx = 450
    const angProx = 0.6 // radians; offset so Proxima sits clear of the binary axis
    const vProx = orbitalSpeed(G, mAB, rProx)
    const px = Math.cos(angProx) * rProx
    const py = Math.sin(angProx) * rProx
    const proxima = new Body({
        x: px,
        y: py,
        vx: -Math.sin(angProx) * vProx, // tangential (perpendicular to the radius)
        vy: Math.cos(angProx) * vProx,
        mass: mProx,
        type: 'star',
        subType: 'redDwarf',
        color: '#f4593a',
    })
    bodies.push(proxima)

    // Proxima's planets: d (an unconfirmed ~0.26 M⊕ candidate, innermost), b (the
    // famous habitable-zone world), and c. Their true orbits (~0.029, ~0.049, and
    // ~1.49 AU) are sub-pixel at this scale, so they're given exaggerated radii
    // around Proxima with speeds set for stable local orbits. The radii stay well
    // inside Proxima's Hill radius (~120 px here) so the A-B pair can't strip them,
    // and the softened speed keeps them on tight, near-circular, bound orbits.
    const proxPlanets = [
        { r: 11, massE: 0.26, color: '#c08a72' }, // Proxima d - ~0.26 M⊕ candidate (unconfirmed)
        { r: 18, massE: 1.07, color: '#6ab0ff' }, // Proxima b - ~1.1 M⊕, habitable zone
        { r: 34, massE: 7.0, color: '#b59a7a' }, // Proxima c - ~7 M⊕ super-Earth
    ]
    proxPlanets.forEach((p, i) => {
        const ang = angProx + Math.PI + i * GOLDEN
        const v = softenedOrbitalSpeed(G, mProx, p.r)
        bodies.push(
            new Body({
                x: px + Math.cos(ang) * p.r,
                y: py + Math.sin(ang) * p.r,
                vx: proxima.vx - Math.sin(ang) * v,
                vy: proxima.vy + Math.cos(ang) * v,
                mass: p.massE / EARTH_PER_RAW,
                type: 'planet',
                subType: 'terrestrial',
                color: p.color,
            }),
        )
    })

    // Cancel any net momentum and recentre on the barycentre so the whole system
    // stays framed (Proxima and its planets would otherwise drift the COM off
    // screen). Subtracting a uniform velocity is a Galilean shift - it leaves every
    // orbit untouched and only removes the bulk drift.
    let M = 0
    let cx = 0
    let cy = 0
    let vcx = 0
    let vcy = 0
    for (const b of bodies) {
        M += b.mass
        cx += b.mass * b.x
        cy += b.mass * b.y
        vcx += b.mass * b.vx
        vcy += b.mass * b.vy
    }
    cx /= M
    cy /= M
    vcx /= M
    vcy /= M
    for (const b of bodies) {
        b.x -= cx
        b.y -= cy
        b.vx -= vcx
        b.vy -= vcy
    }

    // Frame at 1 px = 0.2 AU; pace the ~80-year A-B orbit. (The period is set by
    // the real AU and masses, so it stays ~80 yr at any PX_PER_AU.)
    const metersPerPixel = AU_M / PX_PER_AU
    const periodSim = 2 * Math.PI * Math.sqrt(aAB ** 3 / (G * mAB))
    const speed = (periodSim * secondsPerSimTime(metersPerPixel)) / 15
    return { bodies, metersPerPixel, speed }
}

const randomSystem = (G: number): PresetScene => {
    const starType = randomStarType()
    const starMass = starRaw(starType)
    const star = new Body({ x: 0, y: 0, mass: starMass, type: 'star', subType: starType })
    const bodies: Body[] = [star]

    const count = 2 + ((Math.random() * 14) | 0) // 2–15 planets
    const PX_PER_AU = 100
    const innerR = 80
    const step = (400 - innerR) / Math.max(1, count) // evenly spread 80–350 px

    for (let i = 0; i < count; i++) {
        // Clamp the jittered radius: at low planet counts step is large enough
        // that the innermost planet's jitter could otherwise push r to/below 0,
        // yielding an infinite/NaN orbital speed that corrupts the whole sim.
        const r = Math.max(25, innerR + i * step + (Math.random() - 0.5) * step * 0.8)
        const ang = i * GOLDEN
        const v = orbitalSpeed(G, starMass, r)
        const gas = Math.random() < 0.3
        const subType: PlanetSubtype = gas ? 'gasGiant' : 'terrestrial'
        const massE = gas ? 10 + Math.random() * 290 : 0.1 + Math.random() * 3 // M⊕
        bodies.push(
            new Body({
                x: Math.cos(ang) * r,
                y: Math.sin(ang) * r,
                vx: -Math.sin(ang) * v,
                vy: Math.cos(ang) * v,
                mass: massE / EARTH_PER_RAW,
                type: 'planet',
                subType,
            }),
        )
    }

    // Pace so the innermost planet's orbit takes ~5 s, regardless of star mass.
    const metersPerPixel = AU_M / PX_PER_AU
    const innerPeriodSim = 2 * Math.PI * Math.sqrt(innerR ** 3 / (G * starMass))
    const speed = (innerPeriodSim * secondsPerSimTime(metersPerPixel)) / 5
    return { bodies, metersPerPixel, speed }
}
