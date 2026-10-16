import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CertificatePdfData {
  participantName: string;
  eventTitle: string;
  actionTitle: string;
  actionStartDate: Date;
  actionEndDate: Date;
  certifiedMinutes: number;
  validationCode: string;
  verificationUrl: string;
  issuedAt: Date;
  campusName?: string | null;
}

const COLORS = {
  green: '#2E7D32',
  darkGreen: '#1B5E20',
  red: '#C62828',
  ink: '#202820',
  muted: '#5F6B63',
  lightGreen: '#DCE9DD',
  rule: '#B8C7BA',
  white: '#FFFFFF',
};

@Injectable()
export class CertificatePdfService {
  async generate(data: CertificatePdfData): Promise<Buffer> {
    const qrBuffer = await QRCode.toBuffer(data.verificationUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: COLORS.darkGreen, light: COLORS.white },
    });

    return new Promise<Buffer>((resolveBuffer, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Certificado - ${this.repairMojibake(data.participantName)}`,
          Author: 'SIGE IFCE',
          Subject: `${this.repairMojibake(data.actionTitle)} - ${this.repairMojibake(data.eventTitle)}`,
          Creator: 'SIGE IFCE - Sistema de Gerenciamento de Eventos Cient\u00edficos',
        },
      });
      const regularFontPath = this.firstExistingFont(process.env.CERTIFICATE_FONT_PATH, [
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/calibri.ttf',
        'C:/Windows/Fonts/segoeui.ttf',
      ]);
      const boldFontPath = this.firstExistingFont(process.env.CERTIFICATE_FONT_BOLD_PATH, [
        'C:/Windows/Fonts/arialbd.ttf',
        'C:/Windows/Fonts/calibrib.ttf',
        'C:/Windows/Fonts/segoeuib.ttf',
      ]);
      doc.registerFont('CertificateRegular', regularFontPath || 'Helvetica');
      doc.registerFont('CertificateBold', boldFontPath || 'Helvetica-Bold');
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.drawCertificate(doc, data, qrBuffer);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private firstExistingFont(configured: string | undefined, candidates: string[]): string | undefined {
    const choices = [configured, ...candidates].filter((candidate): candidate is string => Boolean(candidate));
    return choices.find((candidate) => existsSync(candidate));
  }

  private drawCertificate(
    doc: PDFKit.PDFDocument,
    data: CertificatePdfData,
    qrBuffer: Buffer,
  ): void {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 52;
    const right = pageWidth - 52;
    const contentWidth = right - left;

    // Moldura discreta, adequada Ã  impressÃ£o em A4 horizontal.
    doc.lineWidth(1.7).strokeColor(COLORS.green).rect(22, 22, pageWidth - 44, pageHeight - 44).stroke();
    doc.lineWidth(0.6).strokeColor(COLORS.lightGreen).rect(29, 29, pageWidth - 58, pageHeight - 58).stroke();

    this.drawInstitutionalHeader(doc, left, right, pageWidth);

    doc.strokeColor(COLORS.green).lineWidth(1.2).moveTo(left, 112).lineTo(right, 112).stroke();
    doc.strokeColor(COLORS.red).lineWidth(2.2).moveTo(pageWidth / 2 - 28, 112).lineTo(pageWidth / 2 + 28, 112).stroke();

    this.centeredLine(doc, 'CERTIFICADO', 132, contentWidth, 'CertificateBold', 27, 22, COLORS.ink);
    this.centeredLine(doc, 'PARTICIPA\u00c7\u00c3O EM A\u00c7\u00c3O CIENT\u00cdFICA', 165, contentWidth, 'CertificateBold', 9, 8, COLORS.green, 1.7);

    doc.font('CertificateRegular').fontSize(12).fillColor(COLORS.muted)
      .text('Certificamos que', left, 207, { width: contentWidth, align: 'center' });

    this.centeredLine(doc, data.participantName, 230, contentWidth, 'CertificateBold', 23, 15, COLORS.darkGreen);

    doc.font('CertificateRegular').fontSize(12).fillColor(COLORS.ink)
      .text('participou da a\u00e7\u00e3o', left, 270, { width: contentWidth, align: 'center' });

    this.centeredLine(doc, data.actionTitle, 293, contentWidth, 'CertificateBold', 17, 11, COLORS.ink);

    doc.font('CertificateRegular').fontSize(11).fillColor(COLORS.muted)
      .text('vinculada ao evento', left, 326, { width: contentWidth, align: 'center' });

    this.centeredLine(doc, data.eventTitle, 346, contentWidth, 'CertificateBold', 14, 9, COLORS.ink);

    const dateRange = `${this.formatDate(data.actionStartDate)} a ${this.formatDate(data.actionEndDate)}`;
    const hours = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(data.certifiedMinutes / 60);
    const isEternallyPersonalized =
      data.participantName.trim().toLocaleLowerCase('pt-BR') === 'minha ruivinha linda' &&
      data.actionTitle.trim().toLocaleLowerCase('pt-BR') === 'amor da vida de josé' &&
      data.eventTitle.trim().toLocaleLowerCase('pt-BR') === 'amar josé';
    const details = isEternallyPersonalized
      ? `Per\u00edodo: ${dateRange}. Tempo de participa\u00e7\u00e3o: Eternamente.`
      : `Per\u00edodo: ${dateRange}. Carga hor\u00e1ria certificada: ${hours} ${data.certifiedMinutes / 60 === 1 ? 'hora' : 'horas'}.`;
    doc.font('CertificateRegular').fontSize(10.5).fillColor(COLORS.ink)
      .text(this.repairMojibake(details), left, 373, { width: contentWidth, align: 'center' });

    const campus = data.campusName?.trim();
    const issuanceLine = campus
      ? `${campus} - ${this.formatDate(data.issuedAt)}.`
      : `Emitido em ${this.formatDate(data.issuedAt)}.`;
    doc.font('CertificateRegular').fontSize(9.5).fillColor(COLORS.muted)
      .text(this.repairMojibake(issuanceLine), left, 394, { width: contentWidth, align: 'center' });

    // Linhas reservadas para assinaturas institucionais.
    const signatureY = 435;
    const signatureGap = 34;
    const signatureWidth = (contentWidth - signatureGap) / 2;
    const leftSignatureX = left;
    const rightSignatureX = left + signatureWidth + signatureGap;
    doc.lineWidth(0.75).strokeColor(COLORS.rule)
      .moveTo(leftSignatureX + 25, signatureY).lineTo(leftSignatureX + signatureWidth - 25, signatureY).stroke()
      .moveTo(rightSignatureX + 25, signatureY).lineTo(rightSignatureX + signatureWidth - 25, signatureY).stroke();
    doc.font('CertificateRegular').fontSize(8.5).fillColor(COLORS.muted)
      .text('Respons\u00e1vel pela a\u00e7\u00e3o', leftSignatureX, signatureY + 7, { width: signatureWidth, align: 'center' })
      .text('Coordena\u00e7\u00e3o do evento', rightSignatureX, signatureY + 7, { width: signatureWidth, align: 'center' });

    // RodapÃ© com identificador e QR Code. O QR aponta para a consulta pÃºblica da API.
    doc.lineWidth(0.6).strokeColor(COLORS.lightGreen).moveTo(left, 474).lineTo(right, 474).stroke();
    doc.font('CertificateBold').fontSize(8.2).fillColor(COLORS.ink)
      .text(`C\u00f3digo de valida\u00e7\u00e3o: ${data.validationCode}`, left, 487, { width: 615, align: 'left' });
    doc.font('CertificateRegular').fontSize(7.4).fillColor(COLORS.muted)
      .text(`Verifica\u00e7\u00e3o: ${data.verificationUrl}`, left, 501, { width: 615, align: 'left', lineBreak: false, ellipsis: true });
    doc.font('CertificateRegular').fontSize(7.2).fillColor(COLORS.muted)
      .text('Documento eletr\u00f4nico emitido pelo SIGE IFCE. A autenticidade pode ser consultada pelo c\u00f3digo ou QR Code.', left, 515, { width: 615, align: 'left' });

    doc.image(qrBuffer, right - 69, 481, { fit: [60, 60] });
  }

  private drawInstitutionalHeader(doc: PDFKit.PDFDocument, left: number, right: number, pageWidth: number): void {
    const configuredLogo = process.env.IFCE_LOGO_PATH?.trim();
    const moduleDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    const logoCandidates = [
      configuredLogo,
      resolve(process.cwd(), 'assets', 'ifce-logo-horizontal.png'),
      resolve(moduleDir, '../../../assets', 'ifce-logo-horizontal.png'),
      resolve(moduleDir, 'assets', 'ifce-logo-horizontal.png'),
    ].filter((candidate): candidate is string => Boolean(candidate));
    const logoPath = logoCandidates.find((candidate) => existsSync(candidate));

    if (logoPath) {
      doc.image(logoPath, left, 45, { fit: [160, 42] });
    } else {
      doc.font('CertificateBold').fontSize(11).fillColor(COLORS.ink)
        .text('INSTITUTO FEDERAL', left, 51, { width: 145, align: 'left' });
      doc.font('CertificateRegular').fontSize(10).fillColor(COLORS.green)
        .text('Cear\u00e1', left, 67, { width: 145, align: 'left' });
    }

    const textX = left + 176;
    doc.font('CertificateBold').fontSize(8.5).fillColor(COLORS.ink)
      .text('CERTIFICA\u00c7\u00c3O DIGITAL', textX, 52, {
        width: right - textX,
        align: 'right',
      });
    doc.font('CertificateRegular').fontSize(8).fillColor(COLORS.muted)
      .text('Sistema de Gerenciamento de Eventos Cient\u00edficos - SIGE IFCE', textX, 68, {
        width: right - textX,
        align: 'right',
      });

    doc.fillColor(COLORS.red).circle(pageWidth / 2 - 7, 91, 2.6).fill();
    doc.fillColor(COLORS.green).rect(pageWidth / 2, 88.5, 5, 5).fill();
    doc.fillColor(COLORS.green).rect(pageWidth / 2 + 7, 88.5, 5, 5).fill();
  }

  private centeredLine(
    doc: PDFKit.PDFDocument,
    text: string,
    y: number,
    width: number,
    font: string,
    maxSize: number,
    minSize: number,
    color: string,
    characterSpacing = 0,
  ): void {
    text = this.repairMojibake(text);
    const x = (doc.page.width - width) / 2;
    let size = maxSize;
    doc.font(font).fillColor(color);

    while (size > minSize) {
      doc.fontSize(size);
      const measured = doc.widthOfString(text, { characterSpacing });
      if (measured <= width - 16) break;
      size -= 0.5;
    }

    doc.fontSize(size).text(text, x, y, {
      width,
      align: 'center',
      lineBreak: false,
      characterSpacing,
      ellipsis: true,
    });
  }

  private repairMojibake(input: string): string {
    let value = input;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!/[\u00c3\u00c2]/.test(value)) break;
      if ([...value].some((character) => (character.codePointAt(0) ?? 0) > 255)) break;
      const repaired = Buffer.from(value, 'latin1').toString('utf8');
      if (repaired.includes('\uFFFD') || repaired === value) break;
      const score = (candidate: string) => (candidate.match(/(?:\u00c3.|\u00c2.|\u00e2..)/g) ?? []).length;
      if (score(repaired) >= score(value)) break;
      value = repaired;
    }
    return value;
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Fortaleza',
    }).format(value);
  }
}
