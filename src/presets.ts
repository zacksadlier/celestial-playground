// Scene presets. Each returns its bodies (positioned around world origin) plus
// the length scale (metres/pixel) and playback speed (simulated seconds per real
// second) that frame and pace it best. Presets take per-scene options chosen in
// the panel before the scene is built.
import { Body, randomColor } from './physics'
import type { StarSubtype, PlanetSubtype } from './types'
import { EARTH_PER_RAW, AU_M, LY_M, DAY_S, YEAR_S, displayToRaw, SUBTYPE_DEFAULT_MASS, secondsPerSimTime } from './units'

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
    mode: 'ours' | 'random'
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

// Main-sequence classes used when a scene picks a random star.
export const MAIN_SEQUENCE: StarSubtype[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M']
// Evolved/compact stars that can also anchor a random system.
const EVOLVED_STARS: StarSubtype[] = ['whiteDwarf', 'redGiant', 'neutronStar']

// Pick a random central star — usually main-sequence, occasionally evolved.
const randomStarType = (): StarSubtype => {
    const pool = Math.random() < 0.25 ? EVOLVED_STARS : MAIN_SEQUENCE
    return pool[(Math.random() * pool.length) | 0]
}

const GOLDEN = 2.39996323 // spreads starting phases so orbits don't begin aligned

// Circular-orbit velocity for a small body around a central mass at radius r.
const orbitalSpeed = (G: number, centralMass: number, r: number): number => {
    return Math.sqrt((G * centralMass) / r)
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
            new Body({ x: -r1, y: 0, vx: 0, vy: -v1, mass: rawA, type: 'star', subtype: o.starA }),
            new Body({ x: r2, y: 0, vx: 0, vy: v2, mass: rawB, type: 'star', subtype: o.starB }),
        ]

        // Frame so the larger star spans ~20 px; pace so an orbit takes ~8 s.
        const maxR = Math.max(bodies[0].radiusMeters, bodies[1].radiusMeters)
        const metersPerPixel = Math.max(maxR / 20, 1e4)
        const periodSim = (2 * Math.PI * D) / vrel
        const speed = (periodSim * secondsPerSimTime(metersPerPixel)) / 8
        return { bodies, metersPerPixel, speed }
    },

    solar: (G, o) => (o.mode === 'random' ? randomSystem(G) : ourSystem(G)),

    cluster: (_G, o) => {
        const bodies: Body[] = []
        for (let i = 0; i < o.count; i++) {
            const ang = Math.random() * Math.PI * 2
            const rad = Math.random() * 280 + 20
            bodies.push(
                new Body({
                    x: Math.cos(ang) * rad,
                    y: Math.sin(ang) * rad,
                    vx: (Math.random() - 0.5) * 300,
                    vy: (Math.random() - 0.5) * 300,
                    mass: Math.random() * 80 + 15,
                    type: 'planet',
                    color: randomColor(),
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
            const innerRadius = outerRadius * 0.15
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
                enclosed += s.mass // mass interior to the next (larger-radius) star
                bodies.push(
                    new Body({
                        x: cx + Math.cos(s.ang) * s.rad,
                        y: cy + Math.sin(s.ang) * s.rad,
                        vx: vx - Math.sin(s.ang) * v,
                        vy: vy + Math.cos(s.ang) * v,
                        mass: s.mass,
                        type: 'star',
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
    const sun = new Body({ x: 0, y: 0, mass: 2400, type: 'star', subtype: 'G', color: '#ffd27a' }) // 1 M☉
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
    const OUTER_COMPRESS = 0.07
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

const randomSystem = (G: number): PresetScene => {
    const starType = randomStarType()
    const starMass = starRaw(starType)
    const star = new Body({ x: 0, y: 0, mass: starMass, type: 'star', subtype: starType })
    const bodies: Body[] = [star]

    const count = 2 + ((Math.random() * 14) | 0) // 2–15 planets
    const PX_PER_AU = 100
    const innerR = 55
    const step = (350 - innerR) / Math.max(1, count) // evenly spread 55–350 px

    for (let i = 0; i < count; i++) {
        const r = innerR + i * step + (Math.random() - 0.5) * step * 0.4
        const ang = i * GOLDEN
        const v = orbitalSpeed(G, starMass, r)
        const gas = Math.random() < 0.3
        const subtype: PlanetSubtype = gas ? 'gasGiant' : 'terrestrial'
        const massE = gas ? 10 + Math.random() * 290 : 0.1 + Math.random() * 3 // M⊕
        bodies.push(
            new Body({
                x: Math.cos(ang) * r,
                y: Math.sin(ang) * r,
                vx: -Math.sin(ang) * v,
                vy: Math.cos(ang) * v,
                mass: massE / EARTH_PER_RAW,
                type: 'planet',
                subtype,
            }),
        )
    }

    // Pace so the innermost planet's orbit takes ~5 s, regardless of star mass.
    const metersPerPixel = AU_M / PX_PER_AU
    const innerPeriodSim = 2 * Math.PI * Math.sqrt(innerR ** 3 / (G * starMass))
    const speed = (innerPeriodSim * secondsPerSimTime(metersPerPixel)) / 5
    return { bodies, metersPerPixel, speed }
}
