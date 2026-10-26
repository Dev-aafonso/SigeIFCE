(() => {
  window.inicializarModuloConfig = () => {
    const root=document.querySelector('#area-conteudo .module-wrapper');
    if(!root)return;
    const old=root.querySelector('#preferencia-tema-sige');if(old)return;
    const field=document.createElement('section');field.id='preferencia-tema-sige';field.className='secao-inscricoes';
    const title=document.createElement('h3');title.textContent='Aparência';
    const label=document.createElement('label');label.textContent='Tema da interface ';label.style.display='block';label.style.margin='1rem 0';
    const select=document.createElement('select');select.style.maxWidth='260px';select.style.display='block';select.style.marginTop='.5rem';
    for(const [value,name] of [['light','Claro'],['dark','Escuro']])select.add(new Option(name,value));
    select.value=localStorage.getItem('sige_theme')==='dark'?'dark':'light';
    select.addEventListener('change',()=>{document.documentElement.setAttribute('theme',select.value);document.documentElement.style.colorScheme=select.value;localStorage.setItem('sige_theme',select.value);});
    label.append(select);field.append(title,label);root.append(field);
  };
})();
