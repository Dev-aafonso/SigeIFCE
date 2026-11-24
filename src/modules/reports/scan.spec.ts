import { jest } from '@jest/globals';
import { ReportsController } from './reports.controller';
import { UserRole } from '../../generated/prisma/client';
import { structureScanText } from './scan-format';

describe('relatórios digitalizados', () => {
  const event = {findFirst: jest.fn()};
  const scannedReport = {create: jest.fn(), findMany: jest.fn()};
  const controller = new ReportsController({} as never, {event, scannedReport} as never);
  const req = {user: {id: 'org', role: UserRole.ORGANIZADOR}} as never;
  beforeEach(() => {jest.clearAllMocks();});
  it('impede salvar em evento fora do escopo', async () => {
    event.findFirst.mockResolvedValue(null);
    await expect(controller.saveScan({eventId:'outro',text:'documento'},req)).rejects.toThrow();
    expect(scannedReport.create).not.toHaveBeenCalled();
    expect(event.findFirst).toHaveBeenCalledWith({where:{id:'outro',organizerId:'org'},select:{id:true}});
  });
  it('salva texto revisado no evento autorizado', async () => {
    event.findFirst.mockResolvedValue({id:'evento'});scannedReport.create.mockResolvedValue({id:'doc'});
    await controller.saveScan({eventId:'evento',text:' relatório '},req);
    expect(scannedReport.create).toHaveBeenCalledWith(expect.objectContaining({data:{eventId:'evento',authorId:'org',text:structureScanText('relatório').text}}));
  });
  it('rejeita arquivo que não seja imagem suportada', async () => {
    await expect(controller.readScan({buffer:Buffer.from('texto'),mimetype:'image/jpeg'})).rejects.toThrow();
  });
  it('exige HTTPS e token para leitor remoto, sem transmitir a imagem', async () => {
    const previousUrl = process.env.OCR_URL;
    const previousToken = process.env.OCR_TOKEN;
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    try {
      process.env.OCR_URL = 'http://ocr.example/read';
      process.env.OCR_TOKEN = 'x'.repeat(40);
      await expect(controller.readScan({buffer: Buffer.from([255,216,255,1]), mimetype:'image/jpeg'})).rejects.toThrow(/indisponível/);
      expect(fetchSpy).not.toHaveBeenCalled();
      process.env.OCR_URL = 'https://ocr.example/read';
      delete process.env.OCR_TOKEN;
      await expect(controller.readScan({buffer: Buffer.from([255,216,255,1]), mimetype:'image/jpeg'})).rejects.toThrow(/indisponível/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      if (previousUrl === undefined) delete process.env.OCR_URL; else process.env.OCR_URL = previousUrl;
      if (previousToken === undefined) delete process.env.OCR_TOKEN; else process.env.OCR_TOKEN = previousToken;
    }
  });
  it('salva sem evento e lista apenas documentos próprios sem vínculo', async () => {
    scannedReport.create.mockResolvedValue({id:'doc'});
    await controller.saveScan({text:'texto revisado'},req);
    expect(scannedReport.create).toHaveBeenCalledWith(expect.objectContaining({data:{eventId:null,authorId:'org',text:structureScanText('texto revisado').text}}));
    scannedReport.findMany.mockResolvedValue([]);
    await controller.listScans('',req);
    expect(scannedReport.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{eventId:null,authorId:'org'}}));
  });
  it('gera PDF do texto revisado e verifica permissão para o evento', async () => {
    event.findFirst.mockResolvedValue({id:'evento'});
    const response = {set: jest.fn(), end: jest.fn()};
    await controller.exportScanPdf({eventId:'evento',text:'Relatório revisado para teste.'},req,response as never);
    expect(event.findFirst).toHaveBeenCalledWith({where:{id:'evento',organizerId:'org'},select:{id:true}});
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({'Content-Type':'application/pdf'}));
    const contents = response.end.mock.calls[0][0] as Buffer;
    expect(contents.subarray(0,5).toString()).toBe('%PDF-');
  });
  it('não exporta PDF para evento fora do escopo', async () => {
    event.findFirst.mockResolvedValue(null);
    const response = {set: jest.fn(), end: jest.fn()};
    await expect(controller.exportScanPdf({eventId:'outro',text:'teste'},req,response as never)).rejects.toThrow();
    expect(response.end).not.toHaveBeenCalled();
  });
  it('rejeita um relatório que contém apenas os campos vazios', async () => {
    await expect(controller.saveScan({text: structureScanText('').text}, req)).rejects.toThrow();
    expect(scannedReport.create).not.toHaveBeenCalled();
  });
  it('gera o modelo imprimível sem usar dados de evento', async () => {
    const response = {set: jest.fn(), end: jest.fn()};
    await controller.scanTemplate(response as never);
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({'Content-Type':'application/pdf'}));
    const contents = response.end.mock.calls[0][0] as Buffer;
    expect(contents.subarray(0,5).toString()).toBe('%PDF-');
    expect(event.findFirst).not.toHaveBeenCalled();
  });
});

