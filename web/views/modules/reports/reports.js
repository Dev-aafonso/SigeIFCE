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
      $('campo-id-evento-relatorio').hidden=Boolean(events.length);
    }catch(e){select.replaceChildren(new Option('Eventos indisponíveis',''));select.disabled=true;$('campo-id-evento-relatorio').hidden=false;message(e.message,'erro');}
  }
  function bar(container,items,valueKey,maxValue) {
    container.replaceChildren();
    if(!items.length){container.textContent='Sem dados de ações.';return;}
    items.slice(0,20).forEach(item=>{
      const row=document.createElement('div');row.className='linha-grafico-sige';
      const name=document.createElement('span');name.title=item.title||'';name.textContent=(item.title||'Ação').slice(0,28);
      const outer=document.createElement('div');outer.className='barra-grafico-sige';
      const inner=document.createElement('span');inner.style.width=`${Math.max(0,Math.min(100,(Number(item[valueKey]||0)/Math.max(maxValue,1))*100))}%`;
      inner.title=`${item.title}: ${item[valueKey]||0}`;outer.append(inner);row.append(name,outer);container.append(row);
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
      bar($('grafico-presenca-relatorio'),rows,'presentRegistrations',Math.max(1,...rows.map(a=>Number(a.activeRegistrations||0))));
      bar($('grafico-ocupacao-relatorio'),rows,'activeRegistrations',Math.max(1,...rows.map(a=>Number(a.capacity||0))));
      $('graficos-relatorios').hidden=false;
      set('estado-metricas-relatorio','');message('Indicadores atualizados.','sucesso');
    }catch(e){set('estado-metricas-relatorio',e.message);message(e.message,'erro');}
  }
  function exportReport(button) {
    const type=button.dataset.exportReport==='participants'?'registrations':button.dataset.exportReport;
    const format=button.dataset.format;
    if(format==='xlsx'){message('A API exporta CSV e PDF. XLSX não está disponível.','erro');return;}
    const query=filters();query.set('format',format);
    window.location.assign(`/reports/${encodeURIComponent(type)}/export?${query}`);
  }
  window.inicializarModuloRelatorios=()=>{
    const root=document.querySelector('.modulo-relatorios');if(!root)return;
    root.querySelectorAll('[data-format="xlsx"]').forEach(button=>{button.disabled=true;button.title='Formato não suportado pela API (use CSV ou PDF)';});
    $('form-filtros-relatorios')?.addEventListener('submit',loadMetrics);
    $('atualizar-relatorios')?.addEventListener('click',loadMetrics);
    root.querySelectorAll('[data-export-report]').forEach(button=>button.addEventListener('click',()=>exportReport(button)));
    loadEvents();
  };
})();
