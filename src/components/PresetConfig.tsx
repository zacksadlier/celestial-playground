import { Show, For } from 'solid-js'
import { Upload } from 'lucide-solid'
import type { SetStoreFunction } from 'solid-js/store'
import type { PresetName, PresetOptions } from '../presets'
import type { StarSubtype } from '../types'
import { subtypesForType, subtypeShortLabel } from '../units'

interface PresetConfigProps {
    name: PresetName
    options: PresetOptions
    setOptions: SetStoreFunction<PresetOptions>
    onStart: () => void
}

const STAR_SUBTYPES = subtypesForType('star') as StarSubtype[]

const PresetConfig = (props: PresetConfigProps) => {
    return (
        <div class='preset-config'>
            <Show when={props.name === 'binary'}>
                <label class='row'>
                    <span>Star A</span>
                    <select
                        value={props.options.binary.starA}
                        onChange={(e) => props.setOptions('binary', 'starA', e.currentTarget.value as StarSubtype)}
                    >
                        <For each={STAR_SUBTYPES}>
                            {(s) => (
                                <option class='dropdown-option' value={s}>
                                    {subtypeShortLabel(s)}
                                </option>
                            )}
                        </For>
                    </select>
                </label>
                <label class='row'>
                    <span>Star B</span>
                    <select
                        value={props.options.binary.starB}
                        onChange={(e) => props.setOptions('binary', 'starB', e.currentTarget.value as StarSubtype)}
                    >
                        <For each={STAR_SUBTYPES}>
                            {(s) => (
                                <option class='dropdown-option' value={s}>
                                    {subtypeShortLabel(s)}
                                </option>
                            )}
                        </For>
                    </select>
                </label>
            </Show>

            <Show when={props.name === 'solar'}>
                <label class='row'>
                    <span>System</span>
                    <select
                        value={props.options.solar.mode}
                        onChange={(e) => props.setOptions('solar', 'mode', e.currentTarget.value as 'ours' | 'random')}
                    >
                        <option class='dropdown-option' value='ours'>
                            Our system
                        </option>
                        <option class='dropdown-option' value='random'>
                            Random
                        </option>
                    </select>
                </label>
                <Show when={props.options.solar.mode === 'random'}>
                    <p class='config-note'>Random star type & 2–15 planets each time.</p>
                </Show>
            </Show>

            <Show when={props.name === 'cluster'}>
                <label class='row'>
                    <span>Bodies</span>
                    <input
                        type='range'
                        min='5'
                        max='100'
                        step='1'
                        value={props.options.cluster.count}
                        onInput={(e) => props.setOptions('cluster', 'count', +e.currentTarget.value)}
                    />
                    <output>{props.options.cluster.count}</output>
                </label>
            </Show>

            <Show when={props.name === 'collision'}>
                <label class='row'>
                    <span>Stars/gal</span>
                    <input
                        type='range'
                        min='50'
                        max='500'
                        step='10'
                        value={props.options.collision.starsPerGalaxy}
                        onInput={(e) => props.setOptions('collision', 'starsPerGalaxy', +e.currentTarget.value)}
                    />
                    <output>{props.options.collision.starsPerGalaxy}</output>
                </label>
            </Show>

            <button class='start-btn' onClick={() => props.onStart()}>
                <Upload size={14} /> Load Preset
            </button>
        </div>
    )
}

export default PresetConfig
