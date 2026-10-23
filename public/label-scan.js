// Printing is explicit; visiting a label page never opens a print dialog.
document.querySelector('#print-labels')?.addEventListener('click',()=>window.print());
