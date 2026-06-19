import type { Accessor } from 'solid-js'
import { Play, Pause, SkipForward, Trash2, Orbit, Move, Ruler, ZoomIn, ZoomOut, RotateCcw } from 'lucide-solid'
import type { Actions, InteractionMode } from '../lib/types'
import { ICON_SIZE } from '../lib/constants'

interface ToolbarProps {
    running: Accessor<boolean>
    zoom: Accessor<number>
    mode: Accessor<InteractionMode>
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
                classList={{ active: props.mode() === 'body' }}
                title='Body mode - click or drag on empty space to add a body'
                onClick={() => props.actions.setMode('body')}
            >
                <Orbit size={ICON_SIZE} />
                Body
            </button>
            <button
                classList={{ active: props.mode() === 'pan' }}
                title='Pan mode - drag to move the view'
                onClick={() => props.actions.setMode('pan')}
            >
                <Move size={ICON_SIZE} />
                Pan
            </button>
            <button
                classList={{ active: props.mode() === 'measure' }}
                title='Measure mode - drag a line on the canvas'
                onClick={() => props.actions.setMode('measure')}
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
