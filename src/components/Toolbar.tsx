import type { Accessor } from 'solid-js'
import type { Actions } from '../types'

interface ToolbarProps {
    running: Accessor<boolean>
    zoom: Accessor<number>
    measuring: Accessor<boolean>
    actions: Actions
}

const Toolbar = (props: ToolbarProps) => {
    return (
        <footer id='toolbar'>
            <button class='primary' title='Play / Pause (Space)' onClick={props.actions.togglePlay}>
                {props.running() ? '⏸ Pause' : '▶ Play'}
            </button>
            <button title='Advance one frame (S)' onClick={props.actions.step}>
                ⏭ Step
            </button>
            <button title='Remove all bodies (C)' onClick={props.actions.clear}>
                🗑 Clear
            </button>

            <span class='sep' />

            <button
                classList={{ active: props.measuring() }}
                title='Measure distance — drag a line on the canvas'
                onClick={props.actions.toggleMeasure}
            >
                📏 Measure
            </button>

            <span class='sep' />

            <button title='Zoom out' onClick={props.actions.zoomOut}>
                －
            </button>
            <button title='Reset view' onClick={props.actions.resetView}>
                ⟲ View
            </button>
            <button title='Zoom in' onClick={props.actions.zoomIn}>
                ＋
            </button>

            <span class='sep' />

            <span class='zoomLabel'>
                Zoom <b>{Math.round(props.zoom() * 100)}%</b>
            </span>
        </footer>
    )
}

export default Toolbar
