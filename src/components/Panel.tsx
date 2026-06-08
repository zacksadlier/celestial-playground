import { For, Show, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import type { SimSettings, BodyType, BodySubtype, NewBodyConfig, Stats } from '../types'
import type { PresetName, PresetOptions } from '../presets'
import PresetConfig from './PresetConfig'
import {
    formatMass,
    formatEnergy,
    formatSpeed,
    massToSlider,
    sliderToMass,
    MASS_RANGES,
    formatScale,
    scaleToSlider,
    sliderToScale,
    SCALE_PRESETS,
    speedToSlider,
    sliderToSpeed,
    maxStableSpeed,
    subtypesForType,
    subtypeShortLabel,
    SUBTYPE_DEFAULT_MASS,
    defaultSubtypeForType,
} from '../units'

interface PanelProps {
    settings: SimSettings
    setSettings: SetStoreFunction<SimSettings>
    newBody: NewBodyConfig
    setNewBody: SetStoreFunction<NewBodyConfig>
    stats: Stats
    loadPreset: (name: PresetName) => void
    presetOptions: PresetOptions
    setPresetOptions: SetStoreFunction<PresetOptions>
    scale: Accessor<number>
    setScale: (m: number) => void
}

const PRESETS: [PresetName, string][] = [
    ['binary', 'Binary stars'],
    ['solar', 'Solar system'],
    ['cluster', 'Random cluster'],
    ['collision', 'Galaxy collision'],
]

const Panel = (props: PanelProps) => {
    // Which preset's config is open (null = none). Selecting a preset opens its
    // options; Start actually builds the scene.
    const [selected, setSelected] = createSignal<PresetName | null>(null)

    return (
        <aside id='panel'>
            <section class='block'>
                <h2>New Body</h2>

                <label class='row'>
                    <span>Type</span>
                    <select
                        value={props.newBody.type}
                        onChange={(e) => {
                            const type = e.currentTarget.value as BodyType
                            const subtype = defaultSubtypeForType(type)
                            const mass = subtype ? SUBTYPE_DEFAULT_MASS[subtype] : MASS_RANGES[type].default
                            props.setNewBody({ type, subtype, mass })
                        }}
                    >
                        <option class='dropdown-option' value='planet'>
                            Planet
                        </option>
                        <option class='dropdown-option' value='star'>
                            Star
                        </option>
                        <option class='dropdown-option' value='blackhole'>
                            Black hole
                        </option>
                    </select>
                </label>

                <Show when={props.newBody.type !== 'blackhole'}>
                    <label class='row'>
                        <span>Subtype</span>
                        <select
                            value={props.newBody.subtype ?? ''}
                            onChange={(e) => {
                                const subtype = e.currentTarget.value as BodySubtype
                                props.setNewBody({ subtype, mass: SUBTYPE_DEFAULT_MASS[subtype] })
                            }}
                        >
                            <For each={subtypesForType(props.newBody.type)}>
                                {(s) => (
                                    <option class='dropdown-option' value={s}>
                                        {subtypeShortLabel(s)}
                                    </option>
                                )}
                            </For>
                        </select>
                    </label>
                </Show>

                <label class='row'>
                    <span>Mass</span>
                    <input
                        type='range'
                        min='0'
                        max='1'
                        step='0.001'
                        value={massToSlider(props.newBody.mass, props.newBody.type)}
                        onInput={(e) =>
                            props.setNewBody('mass', sliderToMass(+e.currentTarget.value, props.newBody.type))
                        }
                    />
                    <output>{formatMass(props.newBody.mass, props.newBody.type)}</output>
                </label>

                <label class='row check'>
                    <input
                        type='checkbox'
                        checked={props.newBody.randomColor}
                        onChange={(e) => props.setNewBody('randomColor', e.currentTarget.checked)}
                    />
                    <span>Random color</span>
                </label>

                <p class='tip'>A quick click drops a body at rest. Drag to give it momentum.</p>
            </section>

            <section class='block'>
                <h2>Simulation</h2>

                <label class='row'>
                    <span>Gravity</span>
                    <input
                        type='range'
                        min='0'
                        max='4'
                        step='0.05'
                        value={props.settings.G}
                        onInput={(e) => props.setSettings('G', +e.currentTarget.value)}
                    />
                    <output>{props.settings.G.toFixed(2)}</output>
                </label>

                <label class='row'>
                    <span>Speed</span>
                    <input
                        type='range'
                        min='0'
                        max='1'
                        step='0.001'
                        value={speedToSlider(props.settings.speed, maxStableSpeed(props.scale()))}
                        onInput={(e) =>
                            props.setSettings('speed', sliderToSpeed(+e.currentTarget.value, maxStableSpeed(props.scale())))
                        }
                    />
                    <output>{formatSpeed(props.settings.speed)}</output>
                </label>

                <label class='row check'>
                    <input
                        type='checkbox'
                        checked={props.settings.trails}
                        onChange={(e) => props.setSettings('trails', e.currentTarget.checked)}
                    />
                    <span>Show trails</span>
                </label>

                <label class='row check'>
                    <input
                        type='checkbox'
                        checked={props.settings.merge}
                        onChange={(e) => props.setSettings('merge', e.currentTarget.checked)}
                    />
                    <span>Merge on collision</span>
                </label>

                <label class='row check'>
                    <input
                        type='checkbox'
                        checked={props.settings.elastic}
                        onChange={(e) => props.setSettings('elastic', e.currentTarget.checked)}
                    />
                    <span>Bounce off walls</span>
                </label>
            </section>

            <section class='block'>
                <h2>Scale</h2>

                <label class='row'>
                    <span>Length</span>
                    <input
                        type='range'
                        min='0'
                        max='1'
                        step='0.001'
                        value={scaleToSlider(props.scale())}
                        onInput={(e) => {
                            props.setScale(sliderToScale(+e.currentTarget.value))
                        }}
                    />
                </label>

                <p class='scale-readout'>{formatScale(props.scale())}</p>

                <div class='preset-grid'>
                    <For each={SCALE_PRESETS}>
                        {([label, meters]) => <button onClick={() => props.setScale(meters)}>{label}</button>}
                    </For>
                </div>
            </section>

            <section class='block'>
                <h2>Presets</h2>
                <div class='preset-grid'>
                    <For each={PRESETS}>
                        {([key, label]) => (
                            <button
                                classList={{ active: selected() === key }}
                                onClick={() => setSelected((cur) => (cur === key ? null : key))}
                            >
                                {label}
                            </button>
                        )}
                    </For>
                </div>

                <Show when={selected()}>
                    {(name) => (
                        <PresetConfig
                            name={name()}
                            options={props.presetOptions}
                            setOptions={props.setPresetOptions}
                            onStart={() => props.loadPreset(name())}
                        />
                    )}
                </Show>
            </section>

            <section class='block stats'>
                <div>
                    <span>Bodies</span>
                    <b>{props.stats.bodies}</b>
                </div>
                <div>
                    <span>Total KE</span>
                    <b>{formatEnergy(props.stats.energy, props.scale())}</b>
                </div>
                <div>
                    <span>FPS</span>
                    <b>{props.stats.fps}</b>
                </div>
            </section>
        </aside>
    )
}

export default Panel
