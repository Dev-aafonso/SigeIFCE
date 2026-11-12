(() => {
  const $=(id)=>document.getElementById(id);
  const set=(id,value)=>{if($(id))$(id).textContent=String(value);};
  function message(text,type='') {set('mensagem-relatorios',text);if($('mensagem-relatorios'))$('mensagem-relatorios').dataset.tipo=type;}
  async function get(path) {
    const response=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(response.status===401?'Entre na sua conta novamente.':response.status===403?'Seu perfil não pode consultar relatórios.':`Falha na consulta (HTTP ${response.status}).`);
    return response.json();
  }
  function filters() {
    const query=new URLSearchParams();
    const eventId=$('evento-relatorio')?.value||$('id-evento-relatorio')?.value.trim();
    if(eventId)query.set('eventId',eventId);
    const action=$('acao-relatorio')?.value;if(action)query.set('actionId',action);
    const from=$('data-inicio-relatorio')?.value;if(from)query.set('startDateFrom',from);
    const to=$('data-fim-relatorio')?.value;if(to)query.set('startDateTo',to);
    return query;
  }
  async function loadEvents() {
    const select=$('evento-relatorio');if(!select)return;
    try {
      const data=await get('/dashboard/filters');const events=data.events||[];
      select.replaceChildren(new Option(events.length?'Selecione um evento':'Nenhum evento disponível',''));
      events.forEach(item=>select.add(new Option(item.title||item.id,item.id)));
      select.disabled=false;
      const action=$('acao-relatorio');
      select.addEventListener('change',()=>{
        action.replaceChildren(new Option('Todas as ações',''));
        (data.actions||[]).filter(a=>a.eventId===select.value).forEach(a=>action.add(new Option(a.title||a.id,a.id)));
        action.disabled=!select.value;
      });
      $('campo-id-evento-relatorio').hidden=Boolean(events.length); select.required=Boolean(events.length);
    }catch(e){select.replaceChildren(new Option('Eventos indisponíveis',''));select.disabled=true;select.required=false;$('campo-id-evento-relatorio').hidden=false;message(e.message,'erro');}
  }
  function bar(container,items,keys,maxValue) {
    container.replaceChildren();
    if(!items.length){container.textContent='Sem dados de ações.';return;}
    items.slice(0,20).forEach(item=>{
      const row=document.createElement('div');row.className='linha-grafico-sige';
      const name=document.createElement('span');name.title=item.title||'';name.textContent=item.title||'Ação';
      const bars=document.createElement('div'); bars.className='barras-grafico-sige';
      keys.forEach((key,index)=>{ const outer=document.createElement('div');outer.className='barra-grafico-sige';
        const inner=document.createElement('span');if(index) inner.className='barra-secundaria';
        const value=Number(item[key]||0);inner.style.width=`${Math.max(0,Math.min(100,value/Math.max(maxValue,1)*100))}%`;
        inner.title=`${key}: ${value}`;outer.append(inner);bars.append(outer); });
      row.append(name,bars);container.append(row);
    });
  }
  async function loadMetrics(event) {
    event?.preventDefault();const query=filters();if(!query.get('eventId')){message('Selecione ou informe o ID de um evento.','erro');return;}
    message('Consultando indicadores...');set('estado-metricas-relatorio','Carregando métricas...');
    try {
      const [overview,actions]=await Promise.all([get(`/dashboard/overview?${query}`),get(`/dashboard/actions?${query}`)]);
      const totals=overview.totals||{};const rows=Array.isArray(actions)?actions:[];
      set('total-inscritos-relatorio',totals.activeRegistrations??0);
      set('total-presentes-relatorio',totals.presentRegistrations??0);
      set('total-ausentes-relatorio',totals.absentRegistrations??0);
      const capacity=rows.reduce((sum,a)=>sum+Number(a.capacity||0),0);
      set('taxa-ocupacao-relatorio',capacity?`${((Number(totals.activeRegistrations||0)/capacity)*100).toFixed(1)}%`:'—');
      set('taxa-frequencia-relatorio',`${Number(totals.attendanceRate||0).toLocaleString('pt-BR')}%`);
      const tbody=$('linhas-consolidacao-relatorio');tbody.replaceChildren();
      rows.forEach(a=>{
        const tr=document.createElement('tr');
        const hours=Number(a.durationMinutes||0)/60;
        for(const value of [a.title,a.activeRegistrations,a.presentRegistrations,a.absentRegistrations,`${hours.toLocaleString('pt-BR')} h`,`${(hours*Number(a.presentRegistrations||0)).toLocaleString('pt-BR',{maximumFractionDigits:2})} h`]) {
          const cell=document.createElement('td');cell.textContent=String(value??'—');tr.append(cell);
        }
        tbody.append(tr);
      });
      set('estado-consolidacao-relatorio',rows.length?'':'Nenhuma ação encontrada.');
      bar($('grafico-presenca-relatorio'),rows,['presentRegistrations','absentRegistrations'],Math.max(1,...rows.map(a=>Math.max(Number(a.presentRegistrations||0),Number(a.absentRegistrations||0)))));
      bar($('grafico-ocupacao-relatorio'),rows,['activeRegistrations','capacity'],Math.max(1,...rows.map(a=>Math.max(Number(a.capacity||0),Number(a.activeRegistrations||0)))));
      $('graficos-relatorios').hidden=false;
      set('estado-metricas-relatorio','');message('Indicadores atualizados.','sucesso');
    }catch(e){set('estado-metricas-relatorio',e.message);message(e.message,'erro');}
  }
  async function downloadReport(type, format='pdf') {
    const query=filters(); query.set('format',format);
    message('Gerando relatório...');
    try {
      const response=await fetch(`/reports/${encodeURIComponent(type)}/export?${query}`,{credentials:'same-origin'});
      if(!response.ok) throw new Error(`Não foi possível gerar o relatório (HTTP ${response.status}).`);
      const blob=await response.blob(); const url=URL.createObjectURL(blob);
      const labels={registrations:'Inscrições',attendance:'Participação',certificates:'Certificados',events:'Eventos',general:'Geral'};
      const name=type==='general'?'Relatório Geral':`Relatório de ${labels[type]||type}`; const filename=`sige-ifce-${type}.${format}`;
      const link=document.createElement('a'); link.href=url;link.download=filename;link.click();
      const row=document.createElement('tr');
      for(const value of [name,new Date().toLocaleString('pt-BR'),`${(blob.size/1024).toFixed(1)} KB`,format.toUpperCase()]) {const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
      const cell=document.createElement('td');const again=document.createElement('a');again.href=url;again.download=filename;again.textContent='Baixar';cell.append(again);row.append(cell);
      $('historico-relatorios').prepend(row);$('estado-historico-relatorios').hidden=true;
      message('Relatório gerado com sucesso.','sucesso');
    } catch(e) { message(e.message,'erro'); }
  }
  function exportReport(button) {
    const type=button.dataset.exportReport==='participants'?'registrations':button.dataset.exportReport;
    if(button.dataset.format==='xlsx'){message('A API exporta CSV e PDF. XLSX não está disponível.','erro');return;}
    downloadReport(type,button.dataset.format);
  }
  function initializeScan() {
    const search=$('busca-evento-digitalizacao'), select=$('evento-digitalizacao'), file=$('foto-relatorio'), text=$('texto-digitalizado'), state=$('estado-digitalizacao'), save=$('salvar-digitalizacao');
    let seq=0, timer, reviewedEvent=null;
    const show=(message)=>{state.textContent=message;};
    const fetchJson=async(url, options={})=>{const res=await fetch(url,{credentials:'same-origin',...options}); let data={};try{data=await res.json();}catch{} if(!res.ok)throw new Error(data.message||'Não foi possível concluir a operação.');return data;};
    const downloadBlob=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
    async function downloadPdf(content,eventId) {
      if(!content.trim())throw new Error('Informe o texto revisado antes de baixar.');
      const res=await fetch('/reports/scans/pdf',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:content,...(eventId?{eventId}:{})})});
      if(!res.ok){let error={};try{error=await res.json();}catch{}throw new Error(error.message||'Não foi possível gerar o PDF.');}
      downloadBlob(await res.blob(),'sige-ifce-digitalizacao.pdf');
    }
    function suggestEvent() {
      const content=text.value;
      const field=(labels)=>{for(const line of content.split(/\r?\n/)){const match=line.match(new RegExp('^\\s*(?:'+labels+')\\s*[:：]\\s*(.+?)\\s*$','i'));if(match)return match[1].trim();}return '';};
      const date=(value)=>{const m=value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);if(!m)return '';const d=Number(m[1]),month=Number(m[2]),year=Number(m[3]);const test=new Date(Date.UTC(year,month-1,d));return test.getUTCFullYear()===year&&test.getUTCMonth()===month-1&&test.getUTCDate()===d?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';};
      const time=(value)=>{const m=value.match(/\b([01]?\d|2[0-3])\s*(?:\:\s*([0-5]\d)|h(?:\s*([0-5]\d))?)\b/i);return m?`${m[1].padStart(2,'0')}:${m[2]||m[3]||'00'}`:'';};
      const suggestions={ 'scan-evento-nome':field('evento|nome do evento|título|titulo'), 'scan-evento-descricao':field('descrição|descricao|objetivo'), 'scan-evento-local':field('local|localização|localizacao'), 'scan-evento-categoria':field('categoria|tipo do evento'), 'scan-evento-vagas':field('vagas|capacidade'), 'scan-evento-data-inicio':date(field('data de início|data de inicio|início|inicio|data')), 'scan-evento-data-fim':date(field('data de término|data de termino|data final|término|termino')), 'scan-evento-hora-inicio':time(field('horário de início|horario de inicio|hora de início|hora de inicio|horário|horario')), 'scan-evento-hora-fim':time(field('horário de término|horario de termino|hora de término|hora de termino|horário final|horario final')) };
      if(!/^\d+$/.test(suggestions['scan-evento-vagas']))suggestions['scan-evento-vagas']='';
      Object.entries(suggestions).forEach(([id,value])=>{if(value)$(id).value=value;});
      show('Sugestões preenchidas quando identificadas. Confira todos os campos e complete os que faltam.');
    }
    search.addEventListener('input',()=>{clearTimeout(timer); const n=++seq;select.replaceChildren(new Option('Buscando evento...', '')); reviewedEvent=null;save.disabled=true; $('lista-digitalizacoes').replaceChildren(); const term=search.value.trim();if(!term){select.replaceChildren(new Option('Sem evento',''));select.dispatchEvent(new Event('change'));return;} timer=setTimeout(async()=>{try{const events=await fetchJson(`/events/manageable/search?title=${encodeURIComponent(term)}`); if(n!==seq)return;select.replaceChildren(new Option(events.length?'Sem evento':'Nenhum evento encontrado — sem evento',''));events.forEach(e=>select.add(new Option(`${e.title}${e.startDate?' — '+new Date(e.startDate).toLocaleDateString('pt-BR'):''} — ${e.id.slice(-6)}`,e.id)));}catch(e){if(n===seq)show(e.message)}},300);});
    select.addEventListener('change', async()=>{reviewedEvent=null;save.disabled=true;const id=select.value;const list=$('lista-digitalizacoes');list.replaceChildren();try{const entries=await fetchJson(`/reports/scans/list${id ? '?eventId='+encodeURIComponent(id) : ''}`);if(select.value!==id)return;if(!entries.length){list.textContent=id ? 'Nenhum documento salvo para este evento.' : 'Nenhum documento salvo sem evento.';return;}entries.forEach(item=>{const article=document.createElement('article');const date=document.createElement('strong');date.textContent=new Date(item.createdAt).toLocaleString('pt-BR');const content=document.createElement('p');content.style.whiteSpace='pre-wrap';content.textContent=item.text;const download=document.createElement('button');download.type='button';download.className='botao-relatorio botao-relatorio-secundario';download.textContent='Baixar PDF';download.addEventListener('click',async()=>{try{await downloadPdf(item.text,id);show('PDF do documento salvo gerado.');}catch(error){show(error.message);}});article.append(date,content,download);list.append(article)});}catch(e){show(e.message)}});
    file.addEventListener('change',()=>{reviewedEvent=null;save.disabled=true;});
    $('form-digitalizar-relatorio').addEventListener('submit',async(e)=>{e.preventDefault();const eventId=select.value;const image=file.files?.[0];if(!image)return;if(image.size>5*1024*1024){show('A imagem deve ter até 5 MB.');return;}const button=e.currentTarget.querySelector('button');button.disabled=true;save.disabled=true;reviewedEvent=null;show('Lendo imagem, aguarde...');try{const form=new FormData();form.append('image',image);const result=await fetchJson('/reports/scans/read',{method:'POST',body:form});if(select.value!==eventId || file.files?.[0] !== image){show('O evento ou a imagem foi alterado. Leia a imagem novamente.');return;}text.value=result.text||'';reviewedEvent=eventId;save.disabled=!text.value.trim();$('baixar-digitalizacao').disabled=!text.value.trim();if(text.value)suggestEvent();else show('Nenhum texto foi identificado; tente outra imagem.');}catch(error){show(error.message)}finally{button.disabled=false}});
    select.dispatchEvent(new Event('change'));
    text.addEventListener('input',()=>{save.disabled=reviewedEvent===null||reviewedEvent!==select.value||!text.value.trim();$('baixar-digitalizacao').disabled=!text.value.trim();});
    save.addEventListener('click',async()=>{if(reviewedEvent===null||reviewedEvent!==select.value||!text.value.trim())return;save.disabled=true;try{await fetchJson('/reports/scans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(reviewedEvent ? {eventId:reviewedEvent} : {}),text:text.value})});reviewedEvent=null;show('Relatório salvo.');select.dispatchEvent(new Event('change'));}catch(error){show(error.message);save.disabled=false}});
    $('sugerir-evento-digitalizacao').addEventListener('click',suggestEvent);
    $('baixar-digitalizacao').addEventListener('click',async()=>{try{await downloadPdf(text.value,select.value);show('PDF do texto revisado gerado.');}catch(error){show(error.message);}});
    $('baixar-relatorio-evento-scan').addEventListener('click',async()=>{if(!select.value){show('Selecione um evento para baixar seu relatório.');return;}try{const type=$('tipo-relatorio-digitalizacao').value;const query=new URLSearchParams({eventId:select.value,format:'pdf'});const res=await fetch(`/reports/${encodeURIComponent(type)}/export?${query}`,{credentials:'same-origin'});if(!res.ok)throw new Error(`Não foi possível gerar o relatório (HTTP ${res.status}).`);downloadBlob(await res.blob(),`sige-ifce-${type}.pdf`);show('Relatório do evento gerado.');}catch(error){show(error.message);}});
    $('form-evento-digitalizado').addEventListener('submit',async(e)=>{e.preventDefault();const button=$('criar-evento-digitalizado');const start=$('scan-evento-data-inicio').value+'T'+$('scan-evento-hora-inicio').value;const end=$('scan-evento-data-fim').value+'T'+$('scan-evento-hora-fim').value;const startDate=new Date(start),endDate=new Date(end);if(!Number.isFinite(startDate.getTime())||!Number.isFinite(endDate.getTime())||endDate<=startDate){show('Confira as datas e horários: o término deve ser posterior ao início.');return;}const payload={title:$('scan-evento-nome').value.trim(),description:$('scan-evento-descricao').value.trim(),startDate:startDate.toISOString(),endDate:endDate.toISOString()};const location=$('scan-evento-local').value.trim(),category=$('scan-evento-categoria').value.trim(),capacity=$('scan-evento-vagas').value;if(location)payload.location=location;if(category)payload.category=category;if(capacity)payload.totalCapacity=Number(capacity);button.disabled=true;try{const event=await fetchJson('/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!event.id)throw new Error('O evento foi criado, mas a resposta não contém seu identificador. Confira a lista de eventos antes de tentar novamente.');search.value=event.title;select.replaceChildren(new Option(event.title,event.id));select.dispatchEvent(new Event('change'));reviewedEvent=event.id;save.disabled=!text.value.trim();show('Evento criado em rascunho. Revise o texto e salve para vinculá-lo ao novo evento.');}catch(error){show(Array.isArray(error.message)?error.message.join(' '):error.message);}finally{button.disabled=false;}});
  }
  window.inicializarModuloRelatorios=()=>{
    const root=document.querySelector('.modulo-relatorios');if(!root)return;
    root.querySelectorAll('[data-format="xlsx"]').forEach(button=>{button.disabled=true;button.title='Formato não suportado pela API (use CSV ou PDF)';});
    $('form-filtros-relatorios')?.addEventListener('submit',loadMetrics);
    $('atualizar-relatorios')?.addEventListener('click',loadMetrics);
    root.querySelectorAll('[data-export-report]').forEach(button=>button.addEventListener('click',()=>exportReport(button)));
    root.querySelectorAll('[data-catalog-report]').forEach(button=>button.addEventListener('click',()=>downloadReport(button.dataset.catalogReport)));
    initializeScan();
    loadEvents();
  };
})();
