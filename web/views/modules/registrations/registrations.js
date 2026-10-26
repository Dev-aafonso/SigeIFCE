(() => {
  const $=(id)=>document.getElementById(id);
  const text=(id,message)=>{if($(id))$(id).textContent=String(message);};
  const message=(m,type='')=>{text('mensagem-inscricoes',m);if($('mensagem-inscricoes'))$('mensagem-inscricoes').dataset.tipo=type;};
  let actions=[];
  const selected=new Set();
  async function api(path,options={}) {
    const response=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const m=data.message||data.error||`Operação indisponível (HTTP ${response.status})`;throw new Error(Array.isArray(m)?m.join(' '):m);}
    return data;
  }
  async function loadEvents() {
    const selector=$('seletor-evento-acoes');if(!selector)return;
    try {
      const data=await api('/events?limit=100');const events=Array.isArray(data)?data:(data.data||[]);
      selector.replaceChildren(new Option('Selecione o evento',''));
      events.forEach(item=>selector.add(new Option(item.title||item.id,item.id)));
      text('mensagem-seletor-acoes',events.length?'Selecione um evento para listar suas ações.':'Nenhum evento publicado disponível.');
    }catch(e){selector.replaceChildren(new Option('Eventos indisponíveis',''));text('mensagem-seletor-acoes',e.message);}
  }
  function renderActions() {
    const parent=$('lista-acoes-seletor');if(!parent)return;parent.replaceChildren();
    for(const a of actions) {
      const label=document.createElement('label');label.className='cartao-certificado-item';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=a.id;checkbox.style.width='auto';checkbox.style.minHeight='auto';checkbox.checked=selected.has(a.id);
      checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(a.id);else selected.delete(a.id);text('resumo-selecao-acoes',`${selected.size} ações selecionadas`);});
      const title=document.createElement('span');title.textContent=`${a.title||'Ação'} — ${a.capacity??'—'} vagas totais`;
      label.append(checkbox,title);parent.append(label);
    }
    text('resumo-selecao-acoes',`${selected.size} ações selecionadas`);
    if(!actions.length) text('mensagem-seletor-acoes','Nenhuma ação disponível neste evento.');
  }
  async function loadActions() {
    const eventId=$('seletor-evento-acoes')?.value;if(!eventId)return;
    selected.clear();text('mensagem-seletor-acoes','Carregando ações...');
    try {const data=await api(`/events/${encodeURIComponent(eventId)}/actions`);actions=Array.isArray(data)?data:(data.data||[]);renderActions();text('mensagem-seletor-acoes','');}
    catch(e){actions=[];renderActions();text('mensagem-seletor-acoes',e.message);}
  }
  async function submit() {
    if(!selected.size){text('mensagem-seletor-acoes','Selecione pelo menos uma ação.');return;}
    const button=$('confirmar-inscricao-acoes');button.disabled=true;
    let success=0;const errors=[];
    for(const id of selected){try{await api(`/registrations/actions/${encodeURIComponent(id)}`,{method:'POST'});success++;}catch(e){errors.push(e.message);}}
    button.disabled=false;message(`${success} inscrição(ões) enviada(s). ${errors.join(' ')}`,errors.length?'erro':'sucesso');
    if(!errors.length){$('dialog-seletor-acoes')?.close();selected.clear();}
  }
  function exportLocal() {message('A API atual não disponibiliza uma rota de histórico pessoal para exportação.','erro');}
  window.inicializarModuloInscricoes=()=>{
    const root=document.querySelector('.modulo-inscricoes');if(!root)return;
    text('estado-inscricoes','O histórico individual depende de uma rota GET de inscrições do usuário, ainda não encontrada no backend informado. Você pode inscrever-se em novas ações usando o botão acima.');
    text('total-inscricoes-ativas','—');text('total-inscricoes-canceladas','—');text('total-inscricoes','—');
    root.querySelectorAll('[data-inscricao-action="open-selector"]').forEach(b=>b.addEventListener('click',()=>{$('dialog-seletor-acoes')?.showModal();loadEvents();}));
    root.querySelectorAll('[data-inscricao-action="close-selector"]').forEach(b=>b.addEventListener('click',()=>$('dialog-seletor-acoes')?.close()));
    root.querySelectorAll('[data-inscricao-action="close-details"]').forEach(b=>b.addEventListener('click',()=>$('dialog-detalhes-inscricao')?.close()));
    root.querySelectorAll('[data-inscricao-action="export"]').forEach(b=>b.addEventListener('click',exportLocal));
    root.querySelectorAll('[data-inscricao-action="refresh"]').forEach(b=>b.addEventListener('click',()=>message('Histórico pessoal indisponível: falta rota GET de inscrições.','erro')));
    root.querySelectorAll('[data-inscricao-filter]').forEach(b=>b.addEventListener('click',()=>{root.querySelectorAll('[data-inscricao-filter]').forEach(other=>{other.classList.remove('ativa');other.setAttribute('aria-pressed','false');});b.classList.add('ativa');b.setAttribute('aria-pressed','true');}));
    $('seletor-evento-acoes')?.addEventListener('change',loadActions);
    $('confirmar-inscricao-acoes')?.addEventListener('click',submit);
  };
})();
