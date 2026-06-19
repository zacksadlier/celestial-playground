import { X } from 'lucide-solid'

interface InfoModalProps {
    onClose: () => void
}

const InfoModal = (props: InfoModalProps) => {
    return (
        <div class='modal-backdrop' onClick={() => props.onClose()}>
            <div class='modal' onClick={(e) => e.stopPropagation()}>
                <button class='modal-close' title='Close' onClick={() => props.onClose()}>
                    <X size={18} />
                </button>

                <h2 class='modal-title'>
                    <span class='logo'>✦</span> Celestial Playground
                </h2>
                <p class='modal-lead'>
                    A gravitational sandbox. Add stars, planets, and black holes to the canvas and watch them pull on
                    each other in real Newtonian gravity across scales from a solar system to colliding galaxies.
                </p>

                <h3>Interaction modes</h3>
                <p class='modal-lead'>
                    Pick a mode from the toolbar. The active mode is highlighted, and the cursor changes to match it.
                </p>
                <ul>
                    <li>
                        <b>Body mode</b> (default): click empty space to drop a body at rest, or click and drag to launch
                        it (drag direction and length set its velocity). Set the <b>type</b>, <b>subType</b>, and{' '}
                        <b>mass</b> in the New Body panel first.
                    </li>
                    <li>
                        <b>Pan mode</b>: drag the canvas to move the view. You can still pin bodies (see below) with a
                        plain click.
                    </li>
                    <li>
                        <b>Measure mode</b>: drag a line to read a distance, or pause and click two bodies to keep a
                        ruler between them. With two bodies it also shows the gravitational force between them, and the
                        line stays put after you resume.
                    </li>
                </ul>

                <h3>Inspecting &amp; pinning</h3>
                <ul>
                    <li>
                        <b>Hover</b> any body to see its mass, type, and velocity, plus its orbit (period, semi-major
                        axis, eccentricity) when it is orbiting another body.
                    </li>
                    <li>
                        <b>Click</b> a body to <b>pin</b> its tooltip so it stays on screen as the body moves. The pinned
                        body gets a red outline, and its orbital path is drawn when it is in orbit.
                    </li>
                    <li>
                        Only one body is pinned at a time. Click another body to switch, click the pinned body again to
                        unpin, or click the tooltip itself to dismiss it. Pinning works in Body and Pan modes.
                    </li>
                </ul>

                <h3>Navigating</h3>
                <ul>
                    <li>
                        <b>Scroll</b> to zoom toward the cursor. On a touchscreen, <b>pinch</b> to zoom and drag with two
                        fingers to pan.
                    </li>
                    <li>
                        <b>Right-drag</b> or <b>Shift-drag</b> pans in any mode, or use <b>Pan mode</b> for left-drag
                        panning.
                    </li>
                </ul>

                <h3>Controls</h3>
                <ul>
                    <li>
                        <b>Space</b> play/pause · <b>S</b> step one frame · <b>C</b> clear.
                    </li>
                    <li>
                        <b>Scale</b> sets real distance per pixel; <b>Speed</b> sets simulated time per second.
                    </li>
                    <li>
                        <b>Presets</b> open options, then hit <b>Load Preset</b> to build the scene.
                    </li>
                </ul>

                <p class='modal-foot'>
                    Everything runs in self-consistent physical units, hover and measure to explore real masses,
                    distances, and speeds.
                </p>
            </div>
        </div>
    )
}

export default InfoModal
