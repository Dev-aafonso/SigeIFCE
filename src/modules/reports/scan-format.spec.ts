import { structureScanText } from './scan-format';

describe('organização de manuscritos', () => {
  it('reúne os campos em ordem fixa e preserva as informações não classificadas', () => {
    const result = structureScanText([
      'Local: Campus Cedro',
      'Evento: Oficina de Tecnologia',
      'Data: 15/10/2026',
      'Participantes: 25',
      'Observação livre sem rótulo.',
    ].join('\n'));
    expect(result.fields).toMatchObject({
      event: 'Oficina de Tecnologia', startDate: '15/10/2026', endDate: '',
      location: 'Campus Cedro', participants: '25', capacity: '',
    });
    expect(result.text).toContain('Outros trechos reconhecidos: Observação livre sem rótulo.');
    expect(result.text.indexOf('Evento:')).toBeLessThan(result.text.indexOf('Local:'));
    expect(result.hasContent).toBe(true);
  });

  it('mantém textos em várias linhas e não descarta rótulos repetidos', () => {
    const result = structureScanText('Descrição: Primeira linha\nSegunda linha\nEvento: Feira\nEvento: Outro nome\nMais uma anotação');
    expect(result.fields.description).toBe('Primeira linha\nSegunda linha');
    expect(result.fields.event).toBe('Feira');
    expect(result.additional).toContain('Evento: Outro nome');
    expect(result.additional).toContain('Mais uma anotação');
    expect(structureScanText(result.text).text).toBe(result.text);
  });

  it('não considera um formulário vazio como conteúdo e não deduz vagas dos presentes', () => {
    expect(structureScanText(structureScanText('').text).hasContent).toBe(false);
    const result = structureScanText('Participantes presentes: 12\nVagas previstas: 40');
    expect(result.fields.participants).toBe('12');
    expect(result.fields.capacity).toBe('40');
  });

  it('aceita valor reconhecido logo abaixo do rótulo e ignora instruções do modelo vazio', () => {
    const result = structureScanText('SIGE IFCE | MODELO DE MANUSCRITO\nRelatório de evento\nEvento:\nOficina IFCE\nLocal： Cedro');
    expect(result.fields.event).toBe('Oficina IFCE');
    expect(result.fields.location).toBe('Cedro');
    expect(result.additional).toBe('');
    expect(structureScanText('SIGE IFCE | MODELO DE MANUSCRITO\nRelatório de evento\nEvento:\nLocal:').hasContent).toBe(false);
  });
});
