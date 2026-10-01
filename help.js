/* Read-only guidance: opening help never changes the current project. */
(()=>{
 'use strict';
 const dialog=document.getElementById('help-dialog');
 document.getElementById('open-help').addEventListener('click',()=>dialog.showModal());
 document.getElementById('close-help').addEventListener('click',()=>dialog.close());
})();
