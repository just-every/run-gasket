import { Actions } from './Actions'
import { Callout, Drawing, Leaders, Machine } from './Drawing'
import { Calendar } from './icons'

/** The closing band: the hero's promise again over a small business's equipment on one plinth. */
export function Closing() {
  return (
    <section className="landing-closing" aria-labelledby="closing-title">
      <div className="landing-text">
        <h2 id="closing-title">Keep your equipment in service.</h2>
        <Actions />
      </div>
      <Drawing name="closing" label="A walk-in cooler compressor, a twin fryer and an air compressor on one plinth; the compressor is next due on 14 Nov 2026.">
        <Machine src="/brand/band.svg" className="closing-machine" />
        <Leaders width={832} height={740} dots={[[142, 258]]} paths={['M232 150 142 258']} />
        <Callout className="closing-next"><p className="callout-foot callout-plain"><Calendar />Next due 14 Nov 2026</p></Callout>
      </Drawing>
    </section>
  )
}
