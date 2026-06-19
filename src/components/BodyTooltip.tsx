import { Show } from 'solid-js'
import { Pin } from 'lucide-solid'
import type { TooltipInfo } from '../lib/types'

// A single body tooltip (hover or pinned). Position and contents are recomputed
// by the caller each frame, so it tracks its body as the simulation runs. When
// `onDismiss` is given (the pinned tooltip), clicking the tooltip dismisses it and
// the click never reaches the canvas, so it triggers no other action.
const BodyTooltip = (props: { info: TooltipInfo; onDismiss?: () => void }) => {
    return (
        <div
            class='tooltip'
            classList={{ pinned: props.info.pinned }}
            style={{ left: `${props.info.x + 16}px`, top: `${props.info.y + 16}px` }}
            title={props.onDismiss ? 'Click to dismiss' : undefined}
            onClick={() => props.onDismiss?.()}
        >
            <div class='tt-title'>
                <span>{props.info.label}</span>
                <Show when={props.info.pinned}>
                    <Pin size={11} class='tt-pin' />
                </Show>
            </div>
            <div class='tt-row'>
                <span>Mass</span>
                <b>{props.info.mass}</b>
            </div>
            <Show when={props.info.halo}>
                <div class='tt-row'>
                    <span>Halo</span>
                    <b>{props.info.halo}</b>
                </div>
            </Show>
            <div class='tt-row'>
                <span>Velocity</span>
                <b>{props.info.velocity}</b>
            </div>
            <Show when={props.info.orbit}>
                {(orbit) => {
                    const o = orbit()
                    return (
                        <>
                            <div class='tt-orbit-head'>Orbiting {o.parent}</div>
                            <div class='tt-row'>
                                <span>Period</span>
                                <b>{o.period}</b>
                            </div>
                            <div class='tt-row'>
                                <span>Semi-major</span>
                                <b>{o.semiMajor}</b>
                            </div>
                            <div class='tt-row'>
                                <span>Eccentricity</span>
                                <b>{o.eccentricity}</b>
                            </div>
                            <div class='tt-row'>
                                <span>Peri / Apo</span>
                                <b>
                                    {o.periapsis} / {o.apoapsis}
                                </b>
                            </div>
                        </>
                    )
                }}
            </Show>
        </div>
    )
}

export default BodyTooltip
