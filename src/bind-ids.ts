// Part numbers, asset tags, work order numbers and the repository never break at a hyphen ("6316-C3", "AC-02",
// "WO-4466", "just-every/run-gasket"): each sits in a no-wrap <g-id>, and the text run around it in one <g-t>, so a
// flex or grid parent still sees one item. Neither is a span, so no page's span rules reach them. Only text between
// tags changes (never scripts, styles, the title, a textarea's value or an option's label), so copied text is the same.
// The run site styles <g-id> inline; the app's pages, whose policy refuses inline styles, style it in gasket.css.
const ID = /(?<![\w-])(?=[A-Za-z0-9-]*\d)[A-Z0-9][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+(?![\w-])|just-every\/run-gasket/g
const KEEP = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<title>[\s\S]*?<\/title>|<textarea[\s\S]*?<\/textarea>|<option[\s\S]*?<\/option>|<[^>]+>)/

export const bindIds = (html: string, open = '<g-id style="white-space:nowrap">') => html.split(KEEP)
  .map((part, index) => index % 2 || !part.match(ID) ? part : `<g-t>${part.replace(ID, `${open}$&</g-id>`)}</g-t>`).join('')
