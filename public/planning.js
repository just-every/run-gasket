// Dragging proposes a move; only the explicit confirmation POST writes it.
let dragged=null
for(const item of document.querySelectorAll('[draggable][data-work]')) item.addEventListener('dragstart',event=>{
  dragged=item;event.dataTransfer.setData('text/plain',item.dataset.work)
})
for(const day of document.querySelectorAll('[data-day]')) {
  day.addEventListener('dragover',event=>event.preventDefault())
  day.addEventListener('drop',event=>{
    event.preventDefault()
    if(!dragged)return
    const form=document.getElementById('planning-preview')
    form.elements.workOrder.value=dragged.dataset.work
    form.elements.starts.value=day.dataset.day+dragged.dataset.start.slice(10)
    form.elements.ends.value=day.dataset.day+dragged.dataset.end.slice(10)
    for(const tool of form.querySelectorAll('[name="tool"]'))tool.checked=dragged.dataset.tools.split(',').includes(tool.value)
    form.requestSubmit()
  })
}
