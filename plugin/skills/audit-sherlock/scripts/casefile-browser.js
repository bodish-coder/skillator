document.documentElement.classList.add('js')
document.getElementById('export-pdf').addEventListener('click', () => window.print())

for (const run of document.querySelectorAll('[data-run]')) {
  const search = run.querySelector('[data-search]')
  const severity = run.querySelector('[data-severity]')
  const expand = run.querySelector('[data-expand]')
  const empty = run.querySelector('[data-empty]')
  const entries = [...run.querySelectorAll('[data-finding]')].map(card => ({
    card, level: card.dataset.level, text: card.textContent.toLowerCase(),
    body: card.querySelector('[data-body]'), toggle: card.querySelector('[data-toggle]')
  }))
  const visible = () => entries.filter(e => !e.card.hidden)
  function setOpen(entry, open) {
    entry.toggle.setAttribute('aria-expanded', String(open))
    entry.body.hidden = !open
  }
  function updateExpand() {
    const shown = visible()
    expand.disabled = !shown.length
    expand.textContent = shown.length && shown.every(e => !e.body.hidden) ? 'Collapse all' : 'Expand all'
  }
  function filter() {
    const words = search.value.trim().toLowerCase().split(/\s+/)
    for (const e of entries) {
      e.card.hidden = Boolean((severity.value && severity.value !== e.level) || !words.every(w => e.text.includes(w)))
    }
    const n = visible().length
    run.querySelector('[data-results]').textContent = n + ' of ' + entries.length + ' findings'
    if (empty) empty.hidden = n !== 0
    updateExpand()
  }
  entries.forEach((e,i) => {
    setOpen(e, i === 0)
    e.toggle.addEventListener('click', () => { setOpen(e, e.body.hidden); updateExpand() })
  })
  expand.addEventListener('click', () => {
    const shown = visible()
    const open = shown.some(e => e.body.hidden)
    shown.forEach(e => setOpen(e, open))
    updateExpand()
  })
  search.addEventListener('input', filter)
  severity.addEventListener('change', filter)
  filter()
}
