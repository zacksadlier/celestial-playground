// Hover + pinned body tooltips: building the display payload from a body, and the
// per-frame logic resolving which body each tooltip describes. Extracted from App
// to keep the component focused on wiring.
import { createSignal } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import { isBlackHole, findOrbit } from '../physics'
import type { Body, Simulation } from '../physics'
import type { TooltipInfo } from '../lib/types'
import {
    rawToDisplay,
    formatMass,
    formatVelocity,
    subtypeLabel,
    formatLength,
    formatDuration,
    secondsPerSimTime,
} from '../lib/units'

// Build the tooltip payload for a body: label, mass, velocity, orbit elements, and
// its current screen position (so the tooltip tracks the moving body). Pure: pass
// the current length scale (metres/pixel) and gravitational constant G.
export const buildTooltip = (
    sim: Simulation,
    b: Body,
    isPinned: boolean,
    metersPerPixel: number,
    G: number,
): TooltipInfo => {
    const [sx, sy] = sim.toScreen(b.x, b.y)
    // Black holes carry a halo add-on; show the body's own mass and the halo separately.
    const hasHalo = isBlackHole(b) && b.haloMass > 0
    const ownMass = hasHalo ? b.mass - b.haloMass : b.mass
    // If the body is bound to a heavier primary, describe that orbit.
    const orbit = findOrbit(sim.bodies, b, G)
    return {
        label: subtypeLabel(b.type, b.subType),
        mass: formatMass(rawToDisplay(ownMass, b.type), b.type),
        halo: hasHalo ? formatMass(rawToDisplay(b.haloMass, b.type), b.type) : undefined,
        velocity: formatVelocity(Math.hypot(b.vx, b.vy), metersPerPixel),
        orbit: orbit
            ? {
                  parent: subtypeLabel(orbit.parent.type, orbit.parent.subType),
                  period: formatDuration(orbit.periodSim * secondsPerSimTime(metersPerPixel)),
                  semiMajor: formatLength(orbit.semiMajorPx * metersPerPixel),
                  eccentricity: orbit.eccentricity.toFixed(3),
                  periapsis: formatLength(orbit.periapsisPx * metersPerPixel),
                  apoapsis: formatLength(orbit.apoapsisPx * metersPerPixel),
              }
            : undefined,
        pinned: isPinned,
        x: sx,
        y: sy,
    }
}

export interface TooltipsDeps {
    sim: Simulation
    mouse: { x: number; y: number; inside: boolean }
    drag: { active: boolean }
    pickBody: (sx: number, sy: number) => Body | null
    metersPerPixel: Accessor<number>
    gravity: Accessor<number>
}

export interface Tooltips {
    hoverTip: Accessor<TooltipInfo | null>
    pinnedTip: Accessor<TooltipInfo | null>
    pinned: Accessor<Body | null>
    setPinned: Setter<Body | null>
    overBody: Accessor<boolean>
    updateTooltip: () => void
}

// Own the hover/pinned tooltip signals plus the per-frame resolution: the pinned
// body keeps its tooltip anchored to itself, while hovering any *other* body shows
// a transient tooltip. `overBody` drives the pointer cursor in Pan mode. Call
// `updateTooltip()` once per frame.
export const createTooltips = (deps: TooltipsDeps): Tooltips => {
    const { sim, mouse, drag, pickBody, metersPerPixel, gravity } = deps
    const [hoverTip, setHoverTip] = createSignal<TooltipInfo | null>(null)
    const [pinnedTip, setPinnedTip] = createSignal<TooltipInfo | null>(null)
    const [pinned, setPinned] = createSignal<Body | null>(null)
    const [overBody, setOverBody] = createSignal(false)

    const updateTooltip = (): void => {
        // Forget a pinned body that was merged away or cleared.
        const pin = pinned()
        if (pin && (!pin.alive || !sim.bodies.includes(pin))) setPinned(null)

        const mpp = metersPerPixel()
        const G = gravity()

        // The pinned body always shows a tooltip, anchored to it as it moves.
        const current = pinned()
        setPinnedTip(current ? buildTooltip(sim, current, true, mpp, G) : null)

        // Independently, hovering any *other* body shows a transient tooltip.
        const hovered = !drag.active && mouse.inside ? pickBody(mouse.x, mouse.y) : null
        setHoverTip(hovered && hovered !== current ? buildTooltip(sim, hovered, false, mpp, G) : null)
        setOverBody(hovered !== null)
    }

    return { hoverTip, pinnedTip, pinned, setPinned, overBody, updateTooltip }
}
