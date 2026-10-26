(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = String(value); };
  const msg = (message, type='') => { text('mensagem-certificados', message); if ($('mensagem-certificados')) $('mensagem-certificados').dataset.tipo=type; };
  let userRole = '';
  let currentEvent = null;
  async function json(path) {
    const response = await fetch(path, {credentials:'same-origin',headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error(response.status === 401 ? 'Entre na sua conta para consultar certificados.' : response.status === 403 ? 'Você não possui permissão para esta consulta.' : `Consulta indisponível (HTTP ${response.status}).`);
    return response.json();
  }
  function make(tag, cls, value) { const el=document.createElement(tag); if(cls) el.className=cls; if(value!==undefined) el.textContent=String(value); return el; }
  function item(cert) {
    const card=make('article','cartao-certificado-item');
    card.append(make('h4','',cert.action?.title || cert.event?.title || 'Certificado'));
    card.append(make('p','',`Evento: ${cert.event?.title || 'Não informado'}`));
    if(cert.validationCode) card.append(make('p','',`Código: ${cert.validationCode}`));
    const hours = Number(cert.certifiedHours ?? ((cert.certifiedMinutes || 0)/60));
    card.append(make('p','',`Carga horária: ${Number.isFinite(hours) ? hours.toLocaleString('pt-BR') : '—'} h`));
    if(cert.revoked) card.append(make('p','estado-erro-sige','Certificado revogado'));
    else if(cert.id) {
      const actions=make('div','acoes-certificado-item');
      const download=make('a','botao-certificado botao-certificado-primario','Baixar PDF');
      download.href=`/certificates/${encodeURIComponent(cert.id)}/download`;
      actions.append(download);card.append(actions);
    }
    return card;
  }
  async function loadMine() {
    const list=$('lista-certificados'); if(!list)return;
    list.replaceChildren(); list.setAttribute('aria-busy','true'); text('estado-lista-certificados','Carregando certificados...');
    try {
      const result=await json('/certificates/me');
      if (!document.contains(list))return;
      const items=Array.isArray(result)?result:Array.isArray(result?.data)?result.data:[];
      items.forEach(cert=>list.append(item(cert)));
      const valid=items.filter(c=>!c.revoked);
      text('total-certificados',valid.length);
      text('total-horas-certificados', `${valid.reduce((sum,c)=>sum+Number(c.certifiedHours ?? (c.certifiedMinutes||0)/60),0).toLocaleString('pt-BR',{maximumFractionDigits:2})} h`);
      text('estado-lista-certificados', items.length ? '' : 'Nenhum certificado emitido para sua conta até o momento.');
      msg('');
    } catch(e) { text('estado-lista-certificados',e.message); msg(e.message,'erro'); }
    finally { list.setAttribute('aria-busy','false'); }
  }
  async function loadEvent(event) {
    event.preventDefault();const id=$('id-evento-certificados')?.value.trim(); if(!id)return;
    text('mensagem-gestao-certificados','Consultando evento...');
    try {
      currentEvent=await json(`/events/${encodeURIComponent(id)}/manage`);
      text('nome-evento-certificados',currentEvent.title||'Evento');
      text('metadados-evento-certificados',`${(currentEvent.actions||[]).length} ações vinculadas`);
      text('status-evento-certificados',currentEvent.status||'');
      text('liberacao-certificados','Por ação encerrada');
      text('emitidos-certificados','Consulte os certificados emitidos');
      $('detalhes-evento-certificados').hidden=false;
      text('mensagem-gestao-certificados','A API disponível emite certificados por inscrição individual, não por evento em lote.');
      $('emitir-certificados').disabled=true;
    }catch(e){currentEvent=null;$('detalhes-evento-certificados').hidden=true;text('mensagem-gestao-certificados',e.message);}
  }
  window.inicializarModuloCertificados=async () => {
    const root=document.querySelector('.modulo-certificados');if(!root)return;
    let role='';try{role=JSON.parse(localStorage.getItem('sige_user')||'{}').role||'';}catch{}
    userRole=role;
    const admin=['ADMIN','ORGANIZADOR'].includes(role);
    $('painel-gestao-certificados').hidden=!admin;
    $('atualizar-certificados')?.addEventListener('click',loadMine);
    $('abrir-validacao-certificado')?.addEventListener('click',()=>$('dialog-validar-certificado')?.showModal());
    $('fechar-validacao-certificado')?.addEventListener('click',()=>$('dialog-validar-certificado')?.close());
    $('form-validar-certificado')?.addEventListener('submit',async (event)=>{
      event.preventDefault();
      const code=$('codigo-validacao-certificado').value.trim();if(!code)return;
      text('resultado-validacao-certificado','Consultando código...');
      try {
        const result=await json(`/certificates/validate/${encodeURIComponent(code)}`);
        text('resultado-validacao-certificado',result.valid?`Certificado válido — ${result.certificate?.participantName||'participante'} (${result.certificate?.eventTitle||'evento'}).`:result.message||'Certificado inválido.');
      }catch(error){text('resultado-validacao-certificado',error.message);}
    });
    $('form-evento-certificados')?.addEventListener('submit',loadEvent);
    $('fechar-preview-certificado')?.addEventListener('click',()=>$('dialog-preview-certificado')?.close());
    $('cancelar-emissao-certificados')?.addEventListener('click',()=>$('dialog-confirmar-emissao-certificados')?.close());
    await loadMine();
  };
})();
