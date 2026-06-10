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

                <h3>Adding bodies</h3>
                <ul>
                    <li>
                        <b>Click</b> empty space to drop a body at rest.
                    </li>
                    <li>
                        <b>Click &amp; drag</b> to launch it, direction and length set the initial velocity.
                    </li>
                    <li>
                        Pick the <b>type</b>, <b>subType</b>, and <b>mass</b> in the New Body panel first.
                    </li>
                </ul>

                <h3>Navigating</h3>
                <ul>
                    <li>
                        <b>Scroll</b> to zoom toward the cursor.
                    </li>
                    <li>
                        <b>Right-drag</b> (or Shift-drag) to pan the view.
                    </li>
                    <li>
                        <b>Hover</b> a body to inspect its mass, type, and velocity.
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
                        <b>📏 Measure</b> draws a ruler. Just drag a line or pause and click two bodies.
                        <ul>
                            <li>
                                Clicking two bodies will maintain the line between them even after clicking play. It
                                will also display the force they exert on each other due to gravitation.
                            </li>
                        </ul>
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
