import { Art } from '../parts'

/** 06 · The Mesa storeroom in daylight: Angela Ruiz tapes the box for T-0318. The tag is HTML at the painted leader's end. */
export function Interlude() {
  return (
    <section className="scene interlude" aria-label="Mesa, Monday morning">
      <div className="scene-frame">
        <Art name="interlude" width={1536} height={1024} phone={{ name: 'interlude-phone', widths: [600, 776], width: 776, height: 924 }}
          alt="The Mesa storeroom in clear desert daylight: the roll-up door open onto a gravel yard with a saguaro and the Superstition Mountains beyond, copper racks with bin B-14 holding one boxed bearing, and Angela Ruiz taping one small box at a steel counter." />
        <p className="scene-tag interlude-tag">Mesa · Mon Oct 19 · 11:20 am MST · <span className="nowrap">T-0318</span> · <span className="nowrap">2 × 6316-C3</span> to Dayton</p>
      </div>
    </section>
  )
}
