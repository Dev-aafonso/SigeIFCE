/** A single definition for the printable manuscript and reviewed output. */
export const SCAN_FIELDS = [
  { key: 'event', label: 'Evento', aliases: ['evento', 'nome do evento', 'titulo', 'titulo do evento'], lines: 1 },
  { key: 'description', label: 'Descrição', aliases: ['descricao', 'objetivo'], lines: 2 },
  { key: 'startDate', label: 'Data de início', aliases: ['data de inicio', 'data inicial', 'data'], lines: 1 },
  { key: 'startTime', label: 'Horário de início', aliases: ['horario de inicio', 'hora de inicio', 'horario inicial'], lines: 1 },
  { key: 'endDate', label: 'Data de término', aliases: ['data de termino', 'data final', 'data de fim'], lines: 1 },
  { key: 'endTime', label: 'Horário de término', aliases: ['horario de termino', 'hora de termino', 'horario final', 'hora de fim'], lines: 1 },
  { key: 'location', label: 'Local', aliases: ['local', 'localizacao'], lines: 1 },
  { key: 'category', label: 'Categoria', aliases: ['categoria', 'tipo do evento'], lines: 1 },
  { key: 'capacity', label: 'Vagas previstas', aliases: ['vagas previstas', 'vagas', 'capacidade'], lines: 1 },
  { key: 'participants', label: 'Participantes presentes', aliases: ['participantes presentes', 'participantes', 'numero de participantes'], lines: 1 },
  { key: 'account', label: 'Relato', aliases: ['relato', 'relatorio', 'observacoes', 'atividades realizadas'], lines: 4 },
] as const;

type ScanFieldKey = (typeof SCAN_FIELDS)[number]['key'];
type ScanValues = Record<ScanFieldKey, string>;

function labelKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const fieldByLabel = new Map<string, (typeof SCAN_FIELDS)[number]>();
for (const field of SCAN_FIELDS) {
  for (const alias of field.aliases) fieldByLabel.set(alias, field);
}
const templateInstructions = new Set([
  'sige ifce | modelo de manuscrito',
  'relatorio de evento',
  'preencha a mao, com letra legivel. use uma linha para cada campo e fotografe a folha inteira.',
  'confira o texto reconhecido antes de salvar ou criar o evento.',
]);

/**
 * Recognize explicitly labelled values only. Unknown lines and repeated labels
 * are kept for review; no dates, attendance or other facts are inferred.
 */
export function structureScanText(input: string) {
  const fields = Object.fromEntries(SCAN_FIELDS.map(({ key }) => [key, ''])) as ScanValues;
  const seen = new Set<ScanFieldKey>();
  const extra: string[] = [];
  let continuation: ScanFieldKey | 'extra' | undefined;

  for (const original of input.replace(/\r\n?/g, '\n').split('\n')) {
    const line = original.trim();
    if (!line) continue;
    if (templateInstructions.has(labelKey(line))) continue;
    const match = line.match(/^([^:：]{1,80})[:：]\s*(.*)$/);
    const label = match ? labelKey(match[1]) : '';
    const field = fieldByLabel.get(label);

    if (label === 'outros trechos reconhecidos') {
      continuation = 'extra';
      if (match?.[2]) extra.push(match[2]);
    } else if (field && match) {
      if (seen.has(field.key)) {
        extra.push(line);
        continuation = 'extra';
      } else {
        seen.add(field.key);
        fields[field.key] = match[2].trim();
        continuation = field.lines > 1 || !fields[field.key] ? field.key : undefined;
      }
    } else if (continuation && continuation !== 'extra') {
      fields[continuation] = [fields[continuation], line].filter(Boolean).join('\n');
      if (SCAN_FIELDS.find((field) => field.key === continuation)?.lines === 1) continuation = undefined;
    } else {
      extra.push(line);
    }
  }

  const additional = extra.join('\n');
  const text = [
    ...SCAN_FIELDS.map(({ key, label }) => `${label}: ${fields[key]}`.trimEnd()),
    `Outros trechos reconhecidos: ${additional}`.trimEnd(),
  ].join('\n');
  return { text, fields, additional, hasContent: Boolean(additional || Object.values(fields).some(Boolean)) };
}
