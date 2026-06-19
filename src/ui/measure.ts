// Measure-tool state and the per-frame refresh that keeps a body-to-body ruler
// pinned to live body positions. Extracted from App so the component stays lean.
import type { Body, Simulation } from '../physics'
import type { MeasureState } from '../render'
import { formatLength, formatForce, gravitationalForceN } from '../lib/units'

// The render-facing ruler (MeasureState) plus the body-to-body picking state.
//   dragging - a freeform drag ruler is in progress
//   bodyA/bodyB - endpoints when measuring between two bodies
//   pending - first body chosen, waiting for the second
export interface MeasureRuler extends MeasureState {
    dragging: boolean
    bodyA: Body | null
    bodyB: Body | null
    pending: boolean
}

export interface Measure {
    measure: MeasureRuler
    resetMeasure: () => void
    refreshBodyMeasure: () => void
}

// Create the measure ruler bound to a sim and the live cursor position. The caller
// drives `measure.active`/`dragging`/`bodyA`/`bodyB` from its pointer handlers;
// this module keeps a body-to-body ruler in sync each frame.
export const createMeasure = (sim: Simulation, mouse: { x: number; y: number }): Measure => {
    const measure: MeasureRuler = {
        active: false,
        dragging: false,
        bodyA: null,
        bodyB: null,
        pending: false,
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
        label: '',
    }

    const resetMeasure = (): void => {
        measure.active = false
        measure.dragging = false
        measure.bodyA = null
        measure.bodyB = null
        measure.pending = false
    }

    // Keep a body-to-body ruler in sync with the (live) body positions. While
    // only the first body is chosen, the far end rubber-bands to the cursor.
    const refreshBodyMeasure = (): void => {
        const a = measure.bodyA
        if (!a) return
        const b = measure.bodyB
        // Drop the measurement if a referenced body was merged away or cleared.
        if (!a.alive || !sim.bodies.includes(a) || (b && (!b.alive || !sim.bodies.includes(b)))) {
            resetMeasure()
            return
        }
        measure.x0 = a.x
        measure.y0 = a.y
        if (b) {
            measure.x1 = b.x
            measure.y1 = b.y
        } else {
            const [mx, my] = sim.toWorld(mouse.x, mouse.y)
            measure.x1 = mx
            measure.y1 = my
        }
        const dist = Math.hypot(measure.x1 - measure.x0, measure.y1 - measure.y0)
        const distM = dist * sim.metersPerPixel
        measure.label = formatLength(distM)
        // With both endpoints on bodies, also show their mutual gravitational pull.
        if (b) measure.label += `  |  ${formatForce(gravitationalForceN(a.mass, b.mass, distM))}`
    }

    return { measure, resetMeasure, refreshBodyMeasure }
}
