import type { Accessor } from 'solid-js'
import { Play, Pause, SkipForward, Trash2, Ruler, ZoomIn, ZoomOut, RotateCcw } from 'lucide-solid'
import type { Actions } from '../types'

const ICON_SIZE = 16

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
                {props.running() ? <Pause size={ICON_SIZE} /> : <Play size={ICON_SIZE} />}
                {props.running() ? 'Pause' : 'Play'}
            </button>
            <button title='Advance one frame (S)' onClick={props.actions.step}>
                <SkipForward size={ICON_SIZE} />
                Step
            </button>
            <button title='Remove all bodies (C)' onClick={props.actions.clear}>
                <Trash2 size={ICON_SIZE} />
                Clear
            </button>

            <span class='sep' />

            <button
                classList={{ active: props.measuring() }}
                title='Measure distance — drag a line on the canvas'
                onClick={props.actions.toggleMeasure}
            >
                <Ruler size={ICON_SIZE} />
                Measure
            </button>

            <span class='sep' />

            <button class='icon-only' title='Zoom out' onClick={props.actions.zoomOut}>
                <ZoomOut size={ICON_SIZE} />
            </button>
            <button title='Reset view' onClick={props.actions.resetView}>
                <RotateCcw size={ICON_SIZE} />
                View
            </button>
            <button class='icon-only' title='Zoom in' onClick={props.actions.zoomIn}>
                <ZoomIn size={ICON_SIZE} />
            </button>

            <span class='sep' />

            <span class='zoomLabel'>
                Zoom <b>{Math.round(props.zoom() * 100)}%</b>
            </span>
        </footer>
    )
}

export default Toolbar
