(() => {
  const $=(id)=>document.getElementById(id);
  const set=(id,message)=>{if($(id))$(id).textContent=message;};
  let currentEvent=null;
  async function load(event) {
    event?.preventDefault();const id=$('id-evento-participantes')?.value.trim();if(!id)return;
    set('mensagem-participantes','Consultando evento...');
    try {
      const response=await fetch(`/events/${encodeURIComponent(id)}/manage`,{credentials:'same-origin',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(response.status===403?'Seu perfil não tem permissão para gerenciar este evento.':`Não foi possível acessar o evento (HTTP ${response.status}).`);
      currentEvent=await response.json();
      const resumo=$('resumo-evento-participantes');
      resumo.replaceChildren();const h=document.createElement('strong');h.textContent=currentEvent.title||'Evento';
      const p=document.createElement('p');p.textContent=`${(currentEvent.actions||[]).length} ações cadastradas`;resumo.append(h,p);resumo.hidden=false;
      const select=$('filtro-acao-participantes');select.replaceChildren(new Option('Todas as ações',''));
      for(const action of currentEvent.actions||[])select.add(new Option(action.title,action.id));
      $('filtros-lista-participantes').hidden=false;
      set('estado-participantes','O endpoint de listagem de inscrições por evento não está presente no pacote fornecido. Não é possível apresentar presenças reais sem essa integração.');
      set('mensagem-participantes','Evento carregado. Lista nominal e registro de presença dependem da API específica de presenças.');
      $('abrir-leitor-presenca').disabled=true;
    }catch(error){currentEvent=null;set('mensagem-participantes',error.message);set('estado-participantes','Não foi possível carregar participantes.');}
  }
  window.inicializarModuloParticipantes=()=>{
    if(!document.querySelector('.modulo-participantes'))return;
    $('form-evento-participantes')?.addEventListener('submit',load);
    $('atualizar-participantes')?.addEventListener('click',()=>currentEvent?load():set('mensagem-participantes','Informe um evento para consultar.'));
    $('abrir-leitor-presenca').disabled=true;
    set('estado-leitor-presenca','Leitor indisponível até a integração com os endpoints de presença.');
  };
})();
