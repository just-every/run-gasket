import { Actions } from './Actions'
import { Callout, Drawing, Leaders, Machine, Step } from './Drawing'
import { Calendar, Check } from './icons'

/** The hero: the promise, the alternative line and the preventive cycle on one compressor: due, done, reviewed, next due. */
export function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="hero-title">
      <div className="landing-hero-text">
        <h1 id="hero-title">Keep your equipment in service.</h1>
        <p className="landing-sub">Schedules become work orders, finished work gets reviewed, and every asset keeps its full history.</p>
        <p className="landing-alt">100% free, open source alternative to <strong>MaintainX</strong>, <strong>Fiix</strong> and <strong>UpKeep</strong>.</p>
        <Actions />
        <p className="landing-licence">Free and open source, MIT licensed.</p>
      </div>
      <Drawing name="hero" label="The preventive cycle on a walk-in cooler compressor: due, done, reviewed, and next due.">
        <Machine src="/brand/hero-compressor.svg" className="hero-machine" />
        <Leaders width={880} height={820} dots={[[278, 301], [500, 428], [393, 622]]}
          paths={['M240 191 278 301', 'M685 317 500 428', 'M630 725 393 622']}
          arrow="M715 640C790 590 838 510 840 426L830 232C760 110 560 52 352 62M366 53 351 62l15 9" />
        <Callout className="hero-due">
          <p className="callout-head"><Step n={1} />Due</p>
          <p>Monthly compressor check<br />Walk-in cooler compressor</p>
          <p className="callout-foot"><Calendar />Due 15 Oct 2026</p>
        </Callout>
        <Callout className="hero-done">
          <p className="callout-head"><Step n={2} />Done</p>
          <p>4 of 4 complete</p>
          <p className="callout-foot"><Check />Pass</p>
          <span className="callout-button">Submit for review</span>
        </Callout>
        <Callout className="hero-reviewed">
          <p className="callout-head"><Step n={3} />Reviewed</p>
          <p>Reviewed and closed</p>
          <p className="callout-foot callout-next"><Calendar />Next due 14 Nov 2026</p>
        </Callout>
        <span className="hero-return" aria-hidden="true" />
      </Drawing>
    </section>
  )
}
