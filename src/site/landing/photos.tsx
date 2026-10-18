// The phone photos on screen 08, drawn as small plates in the hero's style: flat steel, copper and
// cobalt fills, a fine dark outline, one lit face and one shaded face per part. No text in any photo.

const INK = '#2b303b'
const line = { stroke: INK, strokeWidth: 1.1, strokeLinejoin: 'round' as const }
const fine = { stroke: INK, strokeWidth: 0.8, strokeLinejoin: 'round' as const }

/** A socket-head cap screw seen end on. */
const Bolt = ({ x, y, r = 3.4 }: { x: number; y: number; r?: number }) => (
  <g><circle cx={x} cy={y} r={r} fill="#9aa3b2" {...fine} /><circle cx={x} cy={y} r={r * 0.42} fill="#4a5160" /></g>
)

/** A brass hex fitting on a hose end, its three visible flats lit from above. */
const Fitting = ({ x, y }: { x: number; y: number }) => (
  <g>
    <rect x={x} y={y + 2} width={8} height={14} fill="#b2862a" {...fine} />
    <path d={`M${x + 8} ${y}h20v18h-20z`} fill="#e0b04a" {...line} />
    <path d={`M${x + 8} ${y}h20v6h-20z`} fill="#f3cf75" />
    <path d={`M${x + 8} ${y + 13}h20v5h-20z`} fill="#b98b2c" />
    <path d={`M${x + 8} ${y}h20v18h-20z`} fill="none" {...line} />
    <path d={`M${x + 15} ${y}v18M${x + 21} ${y}v18`} stroke="#9a7020" strokeWidth={0.8} />
    <rect x={x + 28} y={y + 4} width={6} height={10} fill="#d3a23e" {...fine} />
  </g>
)

/** A hydraulic hose from the left edge into a fitting, with its crimped sleeve and a lit edge. */
const Hose = ({ d, sleeveX, y }: { d: string; sleeveX: number; y: number }) => (
  <g>
    <path d={d} fill="none" stroke={INK} strokeWidth={14} />
    <path d={d} fill="none" stroke="#353a47" strokeWidth={11.6} />
    <path d={d} fill="none" stroke="#5b6375" strokeWidth={2} transform="translate(0 -3.4)" />
    <rect x={sleeveX} y={y - 7.5} width={16} height={15} rx={1.5} fill="#b9c0cb" {...line} />
    {[4, 8, 12].map(dx => <path key={dx} d={`M${sleeveX + dx} ${y - 7.5}v15`} stroke="#8c95a5" strokeWidth={0.9} />)}
  </g>
)

/** Luis's photo of the leak: the left die clamp on Press 3 with oil running off its lower supply fitting. */
export const ClampPhoto = () => (
  <svg className="photo" viewBox="0 0 320 190" role="img" aria-label="Photo: the left die clamp on Press 3, oil dripping from its supply fitting">
    <rect width="320" height="190" fill="#cfd5de" />
    <path d="M0 46h320M108 0v132M228 0v132" stroke="#b7bfcb" strokeWidth={1} />
    {/* the press upright at the left and the tie rod at the right */}
    <path d="M0 0h62v136H0z" fill="#aab2bf" {...line} /><path d="M62 0h10v130l-10 6z" fill="#8f98a8" {...line} /><path d="M3 0v134" stroke="#c6ccd6" strokeWidth={2} />
    <Bolt x={14} y={16} /><Bolt x={48} y={16} /><Bolt x={14} y={116} /><Bolt x={48} y={116} />
    <path d="M266 0h44v136h-44z" fill="#b3bac6" {...line} /><path d="M284 0h16v136h-16z" fill="#c9cfd9" {...line} /><path d="M288 0v136" stroke="#e3e7ed" strokeWidth={1.6} />
    <path d="M278 18h28l3 6-3 6h-28l-3-6z" fill="#9aa3b2" {...line} /><path d="M286 18v12M298 18v12" stroke="#7d8697" strokeWidth={0.8} />
    {/* the bolster, its top lit, T-slots across it and the front face in shade */}
    <path d="M0 132h320v12H0z" fill="#c3cad4" {...line} />
    <path d="M0 144h320v46H0z" fill="#9ba4b2" {...line} />
    {[40, 136, 232].map(x => <path key={x} d={`M${x} 150h48v10h-12v20h-24v-20h-12z`} fill="#6f7888" {...fine} />)}
    {[22, 118, 214, 300].map(x => <Bolt key={x} x={x} y={170} r={3} />)}
    {/* the mounting bracket behind the clamp */}
    <path d="M118 8h112v22H118z" fill="#8c95a5" {...line} /><Bolt x={128} y={19} r={3} /><Bolt x={220} y={19} r={3} />
    {/* the clamp body: lit top, copper front, shaded side */}
    <path d="M112 34l12-10h124l-12 10z" fill="#f2a06a" {...line} />
    <path d="M236 34l12-10v86l-12 10z" fill="#b85a26" {...line} />
    <path d="M112 34h124v86H112z" fill="#e07a3e" {...line} />
    <path d="M114 37h120" stroke="#f6b383" strokeWidth={1.6} />
    <path d="M112 64h124" stroke="#b85a26" strokeWidth={1.2} />
    <rect x="128" y="72" width="38" height="16" rx="2" fill="#f4f1ea" {...fine} /><path d="M134 78h22M134 83h14" stroke="#9aa3b2" strokeWidth={1.2} />
    <circle cx="204" cy="90" r="15" fill="#c96a32" {...line} /><circle cx="204" cy="90" r="8" fill="#a3abb8" {...line} /><path d="M197 85a8 8 0 0 1 10-3" stroke="#e3e7ed" strokeWidth={1.4} fill="none" />
    <Bolt x={124} y={46} /><Bolt x={224} y={46} /><Bolt x={124} y={108} /><Bolt x={224} y={108} />
    {/* the jaw pressing on the die */}
    <path d="M150 120h58v12h-58z" fill="#a3abb8" {...line} /><path d="M152 122h54" stroke="#cfd5de" strokeWidth={1.2} />
    {/* the two supply hoses and their fittings */}
    <Hose d="M0 62C34 62 52 64 74 64" sleeveX={66} y={64} />
    <Hose d="M0 114C30 114 48 98 74 98" sleeveX={66} y={98} />
    <Fitting x={82} y={55} />
    <Fitting x={82} y={89} />
    {/* the leak: a wet run under the lower fitting, two drops and the pool on the bolster */}
    <path d="M100 107c-1 4 0 7 1 9" stroke="#e8a317" strokeWidth={2.4} strokeLinecap="round" fill="none" />
    <path d="M101 116c0 5-3.5 7.5-3.5 10.5a3.5 3.5 0 0 0 7 0c0-3-3.5-5.5-3.5-10.5z" fill="#e8a317" stroke="#8a5b06" strokeWidth={0.9} />
    <circle cx="99.8" cy="125.6" r="1" fill="#fbe3a6" />
    <ellipse cx="104" cy="135.5" rx="13" ry="2.6" fill="#e8a317" stroke="#8a5b06" strokeWidth={0.8} />
    <path d="M97 135h7" stroke="#fbe3a6" strokeWidth={1} />
  </svg>
)

/** AC-02 from the aisle: the copper airend and the cobalt motor on their skid, the discharge pipe overhead. */
export const CompressorPhoto = () => (
  <svg className="thumb" viewBox="0 0 120 120" role="img" aria-label="Photo: AC-02">
    <rect width="120" height="120" fill="#d3d9e2" /><path d="M0 98h120v22H0z" fill="#b5bdc8" /><path d="M0 98h120M40 98l-8 22M88 98l8 22" stroke="#9aa3b2" strokeWidth={0.8} />
    <path d="M24 0v22q0 6 6 6h50q6 0 6 6v8" fill="none" stroke={INK} strokeWidth={7.4} />
    <path d="M24 0v22q0 6 6 6h50q6 0 6 6v8" fill="none" stroke="#7d9bc2" strokeWidth={5.4} />
    <path d="M22.6 0v22" stroke="#b4c7e0" strokeWidth={1.2} />
    <path d="M78 24h6v8h-6z" fill="#e0b04a" {...fine} />
    {/* skid and feet */}
    <path d="M8 88h104v8H8z" fill="#6b7486" {...line} /><path d="M8 90h104" stroke="#8c95a5" strokeWidth={1} />
    <path d="M14 96h8v4h-8zM98 96h8v4h-8z" fill="#4a5160" {...fine} />
    {/* copper airend */}
    <path d="M14 46l4-4h28l-4 4z" fill="#f2a06a" {...fine} />
    <path d="M14 46h28v40H14z" fill="#e07a3e" {...line} /><path d="M42 46l4-4v40l-4 4z" fill="#b85a26" {...fine} />
    <path d="M18 56h20M18 64h20M18 72h20" stroke="#b85a26" strokeWidth={0.9} />
    <circle cx="28" cy="36" r="5" fill="#f6f7f9" {...fine} /><path d="M28 36l2.4-2.6" stroke="#d9561f" strokeWidth={1} /><path d="M28 41v5" stroke={INK} strokeWidth={1.4} />
    {/* coupling guard and cobalt motor with its fins, end bell and terminal box */}
    <path d="M46 58h6v18h-6z" fill="#e0b04a" {...fine} />
    <rect x="52" y="48" width="38" height="38" rx="4" fill="#6f8fb8" {...line} />
    {[56, 62, 68, 74, 80].map(y => <path key={y} d={`M54 ${y}h34`} stroke="#4f6d97" strokeWidth={0.9} />)}
    <path d="M54 51h34" stroke="#a9c0de" strokeWidth={1.2} />
    <rect x="90" y="52" width="10" height="30" rx="3" fill="#5677a3" {...line} /><path d="M100 64h6v6h-6z" fill="#9aa3b2" {...fine} />
    <path d="M62 40h16v8H62z" fill="#5677a3" {...line} />
  </svg>
)

// The discharge gauge: 0 to 200 psi over 270°, the needle at 125 psi, the red band from 160. No numerals.
const DIAL = { cx: 60, cy: 56, start: -225, sweep: 270, max: 200 }
const at = (psi: number, r: number) => { const a = (DIAL.start + psi / DIAL.max * DIAL.sweep) * Math.PI / 180; return [DIAL.cx + Math.cos(a) * r, DIAL.cy + Math.sin(a) * r] }
const arc = (from: number, to: number, r: number) => { const [x1, y1] = at(from, r), [x2, y2] = at(to, r); return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}` }

export const GaugePhoto = () => {
  const [nx, ny] = at(125, 31), [tx, ty] = at(125 + DIAL.max * 180 / DIAL.sweep, 8)
  return (
    <svg className="thumb" viewBox="0 0 120 120" role="img" aria-label="Photo: the discharge gauge at 125 psi">
      <rect width="120" height="120" fill="#cfd6e1" />
      <path d="M50 0h20v120H50z" fill="#9fb4d1" {...line} /><path d="M53 0v120" stroke="#c4d3e6" strokeWidth={1.4} />
      <path d="M50 102h20v18H50z" fill="#e0b04a" {...line} /><path d="M50 106h20M50 114h20" stroke="#b2862a" strokeWidth={0.9} />
      <path d="M54 96h12v6H54z" fill="#d3a23e" {...fine} />
      <circle cx="60" cy="56" r="44" fill="#5e6a80" {...line} />
      <circle cx="60" cy="56" r="40" fill="#c9cfd9" {...fine} />
      <circle cx="60" cy="56" r="37.5" fill="#f6f7f9" {...fine} />
      <path d={arc(160, 200, 33.5)} fill="none" stroke="#d9452b" strokeWidth={3} />
      {Array.from({ length: 41 }, (_, i) => { const psi = i * 5, major = i % 4 === 0, [x1, y1] = at(psi, major ? 28 : 31), [x2, y2] = at(psi, 35); return <path key={i} d={`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`} stroke={INK} strokeWidth={major ? 1.4 : 0.6} /> })}
      <path d={`M${tx.toFixed(2)} ${ty.toFixed(2)}L${nx.toFixed(2)} ${ny.toFixed(2)}`} stroke="#d9561f" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx="60" cy="56" r="4.6" fill="#3d4a60" {...fine} /><circle cx="59" cy="55" r="1.3" fill="#9aa3b2" />
      <path d="M30 34a37 37 0 0 1 22-14" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.8} />
    </svg>
  )
}

/** AC-02's motor from its outboard end: cobalt finned frame, the copper end bell and the fan cover's grille. */
export const MotorPhoto = () => (
  <svg className="thumb" viewBox="0 0 120 120" role="img" aria-label="Photo: the motor's outboard end">
    <rect width="120" height="120" fill="#d3d9e2" /><path d="M0 100h120v20H0z" fill="#b5bdc8" /><path d="M0 100h120" stroke="#9aa3b2" strokeWidth={0.8} />
    <path d="M30 14h20v12H30z" fill="#5677a3" {...line} /><path d="M36 8h8v6h-8z" fill="#e07a3e" {...fine} />
    <rect x="6" y="26" width="70" height="64" rx="6" fill="#6f8fb8" {...line} />
    {[34, 41, 48, 55, 62, 69, 76, 83].map(y => <path key={y} d={`M8 ${y}h66`} stroke="#4f6d97" strokeWidth={0.9} />)}
    <path d="M9 29h64" stroke="#a9c0de" strokeWidth={1.4} />
    <path d="M70 22h12v72H70z" fill="#e07a3e" {...line} /><path d="M72 24v68" stroke="#f2a06a" strokeWidth={1.6} /><path d="M80 22v72" stroke="#b85a26" strokeWidth={1.4} />
    <rect x="82" y="30" width="30" height="56" rx="10" fill="#7d9bc2" {...line} />
    {[88, 93, 98, 103, 108].map(x => <path key={x} d={`M${x} 38v40`} stroke="#3e5a82" strokeWidth={1.6} strokeLinecap="round" />)}
    <path d="M85 34q12-4 24 0" stroke="#b4c7e0" strokeWidth={1.2} fill="none" />
    <path d="M14 90h56l4 10H10z" fill="#5677a3" {...line} /><Bolt x={20} y={95} r={2.4} /><Bolt x={64} y={95} r={2.4} />
  </svg>
)
