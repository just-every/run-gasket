import { Art } from '../parts'

/** 13 · The Dayton employee entrance from the lot at 5:56 am, the closing line and actions on the pre-dawn sky. */
export function Closing() {
  return (
    <section className="scene closing" aria-labelledby="closing-title">
      <div className="closing-copy">
        <h2 id="closing-title">Presses up by six.</h2>
        <p className="closing-sub">100% free and open source. MIT licensed.</p>
        <div className="closing-actions">
          <a className="btn btn-white" href="/run">Run Gasket →</a>
          <a className="closing-link" href="/docs">Read the docs</a>
        </div>
      </div>
      <div className="scene-frame">
        <Art name="closing" width={1536} height={1024} phone={{ name: 'closing-phone', widths: [560, 716], width: 716, height: 694 }}
          alt="The Dayton plant's employee entrance from the parking lot at 5:56 am under a deep blue pre-dawn sky: lit windows and door, lot lights, and first-shift workers with lunch coolers walking in." />
        <p className="scene-tag closing-tag">Mon Oct 26 · 6:00 am · <span className="nowrap">Presses 1–4 running <span className="ok">✓</span></span></p>
      </div>
    </section>
  )
}
