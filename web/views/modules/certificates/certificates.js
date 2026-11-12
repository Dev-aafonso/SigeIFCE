(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ''); };
  const msg = (id, message, type='') => { text(id, message); if ($(id)) $(id).dataset.tipo=type; };
  const make = (tag, cls, value) => { const el=document.createElement(tag); if(cls)el.className=cls; if(value!==undefined)el.textContent=String(value); return el; };
  let eventId = null;
  let personalEligible = false;
  let candidates = [];
  let issuing = false;
  let personalEventId = null;
  let personalEvents = [];
  let managerEvents = [];
  let managerSearchSequence = 0;
  let personalSequence = 0;
  let managerSequence = 0;
  let managerTimer;
  const normalize = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
  function optionsFor(events) {
    const valid = events.filter(e => e && e.id && e.title);
    const occurrences = new Map();
    for (const e of valid) occurrences.set(normalize(e.title), (occurrences.get(normalize(e.title)) || 0) + 1);
    const seen = new Map();
    return valid.map(e => {
      const key = normalize(e.title), index = (seen.get(key) || 0) + 1;
      seen.set(key, index);
      const date = e.startDate ? new Date(e.startDate).toLocaleDateString('pt-BR') : '';
      return { ...e, label: occurrences.get(key) > 1 ? `${e.title} — ${date ? `${date} — ` : ''}opção ${index}` : e.title };
    });
  }
  function showOptions(id, items) {
    const list = $(id); if (!list) return;
    list.replaceChildren();
    for (const item of items) { const option = document.createElement('option'); option.value = item.label; list.append(option); }
  }
  function resolveEvent(items, value) {
    const exact = items.filter(e => normalize(e.label) === normalize(value));
    if (exact.length === 1) return exact[0];
    const byName = items.filter(e => normalize(e.title) === normalize(value));
    if (byName.length > 1) throw new Error('Há eventos com o mesmo nome. Escolha uma das sugestões para identificá-lo.');
    if (byName.length === 1) return byName[0];
    throw new Error('Evento não encontrado. Escolha uma das sugestões disponíveis.');
  }
  async function loadPersonalEvents() {
    const result = await json('/registrations/me');
    if (!Array.isArray(result.events)) throw new Error('Não foi possível obter os eventos das suas inscrições.');
    personalEvents = optionsFor(result.events);
    showOptions('eventos-elegibilidade', personalEvents);
  }
  async function searchManagerEvents(term) {
    const sequence = ++managerSearchSequence;
    if (!term) { managerEvents = []; showOptions('eventos-gestao-certificados', []); return; }
    const result = await json(`/events/manageable/search?title=${encodeURIComponent(term)}`);
    if (sequence !== managerSearchSequence) return;
    if (!Array.isArray(result)) throw new Error('Não foi possível obter os eventos disponíveis.');
    managerEvents = optionsFor(result);
    showOptions('eventos-gestao-certificados', managerEvents);
  }
  const json = async (path, opts={}) => {
    const response = await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json',...(opts.body?{'Content-Type':'application/json'}:{})},...opts});
    if(!response.ok) {
      let message=''; try {const data=await response.json();message=Array.isArray(data.message)?data.message.join('; '):data.message;}catch{}
      throw new Error(message || (response.status===401?'Entre na sua conta novamente.':response.status===403?'Sem permissão para esta operação.':`Solicitação indisponível (HTTP ${response.status}).`));
    }
    return response.json();
  };
  const certCard=(cert)=>{
    const card=make('article','cartao-certificado-item');
    card.append(make('h4','',cert.event?.title||'Certificado'));
    card.append(make('p','',cert.scope==='EVENT'?'Abrangência: Evento consolidado':'Abrangência: Ação (legado)'));
    if(cert.scope!=='EVENT'&&cert.action?.title)card.append(make('p','',`Ação: ${cert.action.title}`));
    if(cert.validationCode)card.append(make('p','',`Código: ${cert.validationCode}`));
    const hours=Number(cert.certifiedHours ?? ((cert.certifiedMinutes||0)/60));
    card.append(make('p','',`Carga horária: ${Number.isFinite(hours)?hours.toLocaleString('pt-BR'):'—'} h`));
    if(cert.revoked)card.append(make('p','estado-erro-sige','Certificado revogado'));
    else if(cert.id){const a=make('a','botao-certificado botao-certificado-primario','Baixar PDF');a.href=`/certificates/${encodeURIComponent(cert.id)}/download`;card.append(a);}
    return card;
  };
  async function loadMine(){
    const list=$('lista-certificados');if(!list)return;
    list.replaceChildren();list.setAttribute('aria-busy','true');text('estado-lista-certificados','Carregando certificados...');
    try {
      const result=await json('/certificates/me');if(!document.contains(list))return;
      const items=Array.isArray(result)?result:Array.isArray(result?.data)?result.data:[];
      items.forEach(cert=>list.append(certCard(cert)));
      const valid=items.filter(c=>!c.revoked);
      text('total-certificados',valid.length);
      text('total-horas-certificados', `${valid.reduce((sum,c)=>sum+Number(c.certifiedHours??(c.certifiedMinutes||0)/60),0).toLocaleString('pt-BR',{maximumFractionDigits:2})} h`);
      text('estado-lista-certificados',items.length?'':'Nenhum certificado emitido até o momento.');
      msg('mensagem-certificados','');
    }catch(error){text('estado-lista-certificados',error.message);msg('mensagem-certificados',error.message,'erro');}
    finally{list.setAttribute('aria-busy','false');}
  }
  async function issue(id, userId){
    const body=userId?JSON.stringify({userId}):'{}';
    return json(`/certificates/events/${encodeURIComponent(id)}/issue`,{method:'POST',body});
  }
  async function loadOwnEligibility(ev){
    ev?.preventDefault();personalEligible=false;personalEventId=null;$('emitir-certificado-pessoal').disabled=true;
    const value=$('id-evento-elegibilidade')?.value.trim();if(!value)return;
    const sequence=++personalSequence;
    msg('estado-elegibilidade-pessoal','Consultando requisitos...');
    try{
      if (!personalEvents.length) await loadPersonalEvents();
      if(sequence!==personalSequence)return;
      const id=resolveEvent(personalEvents,value).id;
      const result=await json(`/certificates/events/${encodeURIComponent(id)}/eligibility`);
      if(sequence!==personalSequence)return;
      personalEventId=id;
      const reason={EVENT_NOT_CLOSED:'Evento ainda não encerrado.',INVALID_THRESHOLD:'Frequência mínima configurada incorretamente.',NO_ELIGIBLE_REGISTRATIONS:'Sem inscrições válidas.',BELOW_MIN_ATTENDANCE:'Frequência inferior ao mínimo.'};
      personalEligible=result.eligible===true;
      text('estado-elegibilidade-pessoal',`Frequência: ${result.attendancePercent}% · Mínima: ${result.minAttendancePercent}% · Carga horária frequentada: ${(result.attendedMinutes/60).toLocaleString('pt-BR')} h. ${personalEligible?'Apto à emissão.':(reason[result.reason]||'Emissão indisponível.')}`);
      $('emitir-certificado-pessoal').disabled=!personalEligible;
    }catch(error){if(sequence===personalSequence)msg('estado-elegibilidade-pessoal',error.message,'erro');}
  }
  async function issuePersonal(){
    const id=personalEventId;if(!id||!personalEligible||issuing)return;
    if(!window.confirm('Emitir seu certificado consolidado para este evento?'))return;
    issuing=true;$('emitir-certificado-pessoal').disabled=true;
    try{await issue(id);msg('estado-elegibilidade-pessoal','Certificado emitido. Consulte a lista para baixar o PDF.','sucesso');await loadMine();}
    catch(error){msg('estado-elegibilidade-pessoal',error.message,'erro');}
    finally{issuing=false;$('emitir-certificado-pessoal').disabled=!personalEligible;}
  }
  function renderCandidates(){
    const list=$('lista-elegibilidade-certificados');if(!list)return;
    list.replaceChildren();
    for(const user of candidates){
      const li=make('li','',`${user.name} (${user.email}) — ${user.attendancePercent}% de frequência — ${user.eligible?'APTO':'INELEGÍVEL'}`);
      if(user.eligible){
        const btn=make('button','botao-certificado botao-certificado-secundario','Emitir');btn.type='button';
        btn.addEventListener('click',async()=>{
          if(issuing || !window.confirm(`Emitir certificado para ${user.name}?`))return;
          issuing=true;btn.disabled=true;
          try{await issue(eventId,user.userId);msg('mensagem-gestao-certificados',`Certificado emitido para ${user.name}.`,'sucesso');}
          catch(error){msg('mensagem-gestao-certificados',error.message,'erro');}
          finally{issuing=false;btn.disabled=false;}
        });li.append(btn);
      }
      list.append(li);
    }
    $('resultado-emissao-certificados').hidden=false;
    text('resumo-emissao-certificados',`${candidates.length} participantes avaliados, ${candidates.filter(c=>c.eligible).length} aptos.`);
    $('emitir-certificados').disabled=!candidates.some(c=>c.eligible);
  }
  async function loadManager(ev){
    ev?.preventDefault();eventId=null;candidates=[];$('emitir-certificados').disabled=true;
    const value=$('id-evento-certificados')?.value.trim();if(!value)return;
    const sequence=++managerSequence;
    msg('mensagem-gestao-certificados','Consultando evento...');
    try{
      if (!managerEvents.some(e => normalize(e.label) === normalize(value))) await searchManagerEvents(value);
      if (sequence!==managerSequence) return;
      const id=resolveEvent(managerEvents,value).id;
      const [managed,result]=await Promise.all([json(`/events/${encodeURIComponent(id)}/manage`),json(`/certificates/events/${encodeURIComponent(id)}/candidates`)]);
      if(sequence!==managerSequence || !$('detalhes-evento-certificados'))return;
      eventId=id;candidates=Array.isArray(result.candidates)?result.candidates:[];
      text('nome-evento-certificados',managed.title||result.event?.title||'Evento');
      text('metadados-evento-certificados',`${(managed.actions||[]).length} ações vinculadas`);
      text('status-evento-certificados',managed.status||'');
      text('liberacao-certificados',managed.status==='ENCERRADO'?'Após aferição da frequência':'Após encerramento');
      text('emitidos-certificados','Consulte os certificados emitidos em Relatórios');
      text('elegibilidade-certificados',`Frequência mínima: ${result.minAttendancePercent}%`);
      $('detalhes-evento-certificados').hidden=false;renderCandidates();msg('mensagem-gestao-certificados','Consulta concluída. Emissão individual ou em lote com confirmação.','sucesso');
    }catch(error){if(sequence===managerSequence){$('detalhes-evento-certificados').hidden=true;msg('mensagem-gestao-certificados',error.message,'erro');}}
  }
  function requestBatch(){
    const eligible=candidates.filter(c=>c.eligible);
    if(!eventId||!eligible.length||issuing)return;
    if(eligible.length>50){msg('mensagem-gestao-certificados','Mais de 50 elegíveis: utilize emissão individual ou subdivida o processo.','erro');return;}
    text('descricao-confirmar-emissao-certificados',`Emitir até ${eligible.length} certificados consolidados? A operação gravará documentos definitivos, um por participante. Não será possível desfazê-la por esta interface.`);
    $('dialog-confirmar-emissao-certificados')?.showModal();
  }
  async function confirmBatch(){
    if(issuing || !eventId)return;
    $('dialog-confirmar-emissao-certificados')?.close();issuing=true;$('emitir-certificados').disabled=true;
    const eligible=candidates.filter(c=>c.eligible);const selectedEventId=eventId;let succeeded=0;const failures=[];
    for(const person of eligible){
      try{await issue(selectedEventId,person.userId);succeeded++;}
      catch(error){failures.push(`${person.name}: ${error.message}`);}
    }
    issuing=false;$('emitir-certificados').disabled=false;
    msg('mensagem-gestao-certificados',`Emissão concluída: ${succeeded} processados, ${failures.length} falhas. ${failures.slice(0,3).join(' | ')}`,failures.length?'erro':'sucesso');
    await loadMine();
  }
  window.inicializarModuloCertificados=async()=>{
    const root=document.querySelector('.modulo-certificados');if(!root)return;
    let role='';try{role=JSON.parse(localStorage.getItem('sige_user')||'{}').role||'';}catch{}
    const admin=['ADMIN','ORGANIZADOR','PROFESSOR'].includes(role);
    $('painel-gestao-certificados').hidden=!admin;
    $('atualizar-certificados')?.addEventListener('click',loadMine);
    $('id-evento-elegibilidade')?.addEventListener('input',()=>{
      ++personalSequence;personalEligible=false;personalEventId=null;$('emitir-certificado-pessoal').disabled=true;msg('estado-elegibilidade-pessoal','');
    });
    $('id-evento-certificados')?.addEventListener('input',()=>{
      ++managerSequence;eventId=null;candidates=[];$('emitir-certificados').disabled=true;$('detalhes-evento-certificados').hidden=true;msg('mensagem-gestao-certificados','');
      const value=$('id-evento-certificados').value.trim();
      clearTimeout(managerTimer);++managerSearchSequence;
      if(managerEvents.some(e=>normalize(e.label)===normalize(value)))return;
      managerEvents=[];showOptions('eventos-gestao-certificados',[]);
      if(value)managerTimer=setTimeout(()=>searchManagerEvents(value).catch(error=>msg('mensagem-gestao-certificados',`Não foi possível buscar eventos: ${error.message}`,'erro')),250);
    });
    $('form-elegibilidade-pessoal')?.addEventListener('submit',loadOwnEligibility);
    $('emitir-certificado-pessoal')?.addEventListener('click',issuePersonal);
    $('form-evento-certificados')?.addEventListener('submit',loadManager);
    $('emitir-certificados')?.addEventListener('click',requestBatch);
    $('confirmar-emissao-certificados')?.addEventListener('click',confirmBatch);
    $('cancelar-emissao-certificados')?.addEventListener('click',()=>$('dialog-confirmar-emissao-certificados')?.close());
    $('fechar-preview-certificado')?.addEventListener('click',()=>$('dialog-preview-certificado')?.close());
    $('abrir-validacao-certificado')?.addEventListener('click',()=>$('dialog-validar-certificado')?.showModal());
    $('fechar-validacao-certificado')?.addEventListener('click',()=>$('dialog-validar-certificado')?.close());
    $('form-validar-certificado')?.addEventListener('submit',async(ev)=>{
      ev.preventDefault();const code=$('codigo-validacao-certificado')?.value.trim();if(!code)return;
      text('resultado-validacao-certificado','Verificando...');
      try{const value=await json(`/certificates/validate/${encodeURIComponent(code)}`);text('resultado-validacao-certificado',value.valid?`Certificado válido — ${value.certificate?.participantName||'participante'} (${value.certificate?.eventTitle||'evento'}).`:value.message||'Código inválido.');}
      catch(error){text('resultado-validacao-certificado',error.message);}
    });
    await Promise.all([loadMine(), loadPersonalEvents().catch(error=>msg('estado-elegibilidade-pessoal',`Não foi possível buscar seus eventos: ${error.message}`,'erro'))]);
  };
})();
