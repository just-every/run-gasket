// Generate the derived contract documents using this edition's pinned parser.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseContract } from '../src/base/seed-contract.mjs'

const mode = process.argv[2]
if (!['write', 'check'].includes(mode)) throw new Error('Usage: node scripts/contract-docs.mjs write|check')
let source = readFileSync('CONTRACT.md', 'utf8')
const lines = source.split('\n')
const cells = line => line.trim().slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim())
const rows = lines.filter(line => /^\| `[A-Z][A-Z0-9-]+` \|/.test(line)).map(cells).filter(row => ['published', 'target', 'push-further'].includes(row[2]))
const tally = selected => ['done', 'partial', 'missing'].map(status => selected.filter(row => row[3] === status).length).concat(selected.length)
for (const [name, selected] of [['Published', rows.filter(row => row[2] === 'published')], ['Target and push further', rows.filter(row => row[2] !== 'published')], ['All', rows]]) {
  source = source.replace(new RegExp(`^\\| ${name} \\|.*$`, 'm'), `| ${name} | ${tally(selected).join(' | ')} |`)
}
const contract = parseContract(source)
const marker = '<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->'
const title = source.match(new RegExp('^# (.+?) (?:(?:target )?product )?contract','im'))
if (!title) throw new Error('CONTRACT.md must name the product in its title')
const seed = title[1]
const output = [marker, '', `# Accept a ${seed} installation`, '', 'The requirements, evidence and remaining gaps below come from CONTRACT.md.', '', '## Progress', '', '| Clauses | Done | Partial | Missing | Total |', '| --- | ---: | ---: | ---: | ---: |', ...source.match(/^\| (?:Published|Target and push further|All) \|.*$/gm), '', source.match(/^Judged from.*$/m)[0]]
for (const kind of ['published', 'target', 'push-further']) {
  output.push('', `## ${kind === 'published' ? 'Published clauses' : kind === 'target' ? 'Target clauses' : 'Push further'}`)
  let area
  for (const clause of contract.clauses.filter(row => row.kind === kind).sort((a, b) => a.line - b.line)) {
    if (area !== clause.area) { area = clause.area; output.push('', `### ${area}`) }
    const row = rows.find(row => row[0] === `\`${clause.id}\``)
    output.push('', `#### ${clause.id} — ${clause.title}`, '', `${kind} · **${clause.status}**`, '', clause.text, '', `**Evidence.** ${row[4] || 'None.'}`, '', `**Gap.** ${row[5] || 'None.'}`)
  }
}
// Homepage mapping is owned separately; never invent claims from application copy.
const claims = [marker, '', `# ${seed} homepage claims`, '', 'No homepage claims are mapped yet.'].join('\n') + '\n'
const files = new Map([['CONTRACT.md', source], ['ACCEPTANCE.md', output.join('\n') + '\n'], ['docs/CLAIMS.md', claims]])
for (const [path, content] of files) {
  if (mode === 'write') { if (path.startsWith('docs/')) mkdirSync('docs', { recursive: true }); writeFileSync(path, content) }
  else if (readFileSync(path, 'utf8') !== content) throw new Error(`${path} is stale; run node scripts/contract-docs.mjs write`)
}
console.log(`contract-docs ${mode}: ${contract.counts.total} clauses`)
