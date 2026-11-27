import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  evaluateFiscalizacion,
} from '../services/firestoreService';
import {
  Candidature,
  CandidatureDocument,
  CandidatureModuleType,
  DEFAULT_MOVEMENT_NAME,
  FiscalizacionChecklist,
  SYSTEM_NAME,
} from '../types/electoral';
import { buildOrderedSublistSlots } from './validation';

const MODULE_LABELS: Record<CandidatureModuleType, string> = {
  NACIONAL_PRESIDENCIA: 'Presidente y Vicepresidente de la República',
  NACIONAL_SENADORES: 'Senadores Nacionales (Titulares y Suplentes)',
  NACIONAL_DIPUTADOS: 'Diputados Nacionales por Departamento',
  NACIONAL_GOBERNACION: 'Gobernador y Junta Departamental',
  ANR_NACIONAL_REGIONAL: 'Autoridades ANR (Presidencia, Junta Nacional y Regionales)',
  SECCIONAL_ANR: 'Seccionales ANR (Presidente, Miembros y Convencionales)',
};

function isActualObservation(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return Boolean(
    trimmed &&
      trimmed !== 'Sin observación' &&
      trimmed !== 'Sin observaciones' &&
      trimmed !== 'Sin Registro'
  );
}

export function formatElectoralDateTime(value: unknown): string {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    date = (value as { toDate: () => Date }).toDate();
  } else if (
    value &&
    typeof value === 'object' &&
    'seconds' in value &&
    typeof (value as { seconds: number }).seconds === 'number'
  ) {
    date = new Date((value as { seconds: number }).seconds * 1000);
  } else if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  const target = date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(target.getDate())}/${pad(target.getMonth() + 1)}/${target.getFullYear()} ${pad(target.getHours())}:${pad(target.getMinutes())}:${pad(target.getSeconds())}`;
}

export function getReceiptCode(candidature: Candidature): string {
  const cleanId = (candidature.id || 'BORRADOR').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  return `REC-${cleanId}-V${candidature.versionNumber}`;
}

export function getFiscalizacionReceiptCode(candidature: Candidature): string {
  const cleanId = (candidature.id || 'BORRADOR').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  return `FISC-${cleanId}-V${candidature.versionNumber}`;
}

export function exportCandidatureToPdf(candidature: Candidature): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const movementName = candidature.movementName || DEFAULT_MOVEMENT_NAME;
  const completenessLabel = candidature.isComplete
    ? 'Completa'
    : 'Incompleta con Observaciones';

  // Official Header
  doc.setFillColor(185, 28, 28); // ANR Crimson
  doc.rect(0, 0, 210, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(SYSTEM_NAME.toUpperCase(), 14, 10);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`ANR Partido Colorado · Movimiento: ${movementName}`, 14, 18);

  // Summary Block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(candidature.title, 14, 33);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Movimiento: ${movementName}   |   Lista: Lista ${candidature.listNumber}`, 14, 39);
  doc.text(
    `Ámbito: ${candidature.departamento || 'Nacional'}${candidature.seccional ? ` · ${candidature.seccional}` : ''}   |   Versión: v${candidature.versionNumber}`,
    14,
    44
  );
  doc.text(
    `Escaños: ${candidature.totalCandidates} / ${candidature.requiredCandidates} (${completenessLabel})   |   Estado: ${candidature.reviewStatus}   |   Cargado por: ${candidature.createdByName}`,
    14,
    49
  );

  let currentY = 55;
  if (candidature.reviewComment) {
    const obsLines = doc.splitTextToSize(
      `Observaciones: ${candidature.reviewComment}`,
      182
    ) as string[];
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text(obsLines, 14, currentY);
    currentY += obsLines.length * 4.5 + 3;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
  }

  for (const sublist of candidature.sublists) {
    if (currentY > 250) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(185, 28, 28);
    doc.text(
      `${sublist.label} (${sublist.candidates.length}/${sublist.requiredSeats} escaños)`,
      14,
      currentY
    );

    const orderedSlots = buildOrderedSublistSlots(sublist, {
      moduleType: candidature.moduleType,
      departamento: candidature.departamento,
      seccional: candidature.seccional,
    });

    const rows = orderedSlots.map((slot) => [
      `#${slot.orden}`,
      slot.fullName,
      slot.cedula,
      slot.telefono,
      slot.observacion,
    ]);

    autoTable(doc, {
      startY: currentY + 2,
      head: [
        [
          'Número de Orden',
          'Nombres y Apellidos',
          'Cédula de Identidad',
          'Teléfono',
          'Observación',
        ],
      ],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 7.8, cellPadding: 1.8, textColor: [15, 23, 42] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 52 },
        2: { cellWidth: 30 },
        3: { cellWidth: 28 },
        4: { cellWidth: 50 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          const rowRaw = hookData.row.raw as string[] | undefined;
          if (rowRaw && rowRaw[1] === 'Sin Registro') {
            hookData.cell.styles.textColor = [100, 116, 139];
            hookData.cell.styles.fontStyle = 'italic';
            hookData.cell.styles.fillColor = [248, 250, 252];
          } else if (hookData.column.index === 4 && rowRaw && isActualObservation(rowRaw[4])) {
            hookData.cell.styles.textColor = [185, 28, 28];
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
    currentY = (finalY ?? currentY + 20) + 8;
  }

  const safeName = candidature.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .slice(0, 40);
  doc.save(`SICCE_${safeName}_v${candidature.versionNumber}.pdf`);
}

export function exportCandidatureToExcel(candidature: Candidature): void {
  const wb = XLSX.utils.book_new();
  const movementName = candidature.movementName || DEFAULT_MOVEMENT_NAME;

  const summaryRows: (string | number)[][] = [
    [SYSTEM_NAME.toUpperCase()],
    ['Movimiento', movementName],
    ['Título', candidature.title],
    ['Módulo', MODULE_LABELS[candidature.moduleType] || candidature.moduleType],
    ['Lista', `Lista ${candidature.listNumber}`],
    ['Departamento', candidature.departamento || 'Nacional'],
    ['Seccional', candidature.seccional || 'N/A'],
    ['Escaños Cargados', `${candidature.totalCandidates} / ${candidature.requiredCandidates}`],
    ['Completitud', candidature.isComplete ? 'Completa' : 'Incompleta con Observaciones'],
    ['Estado de Revisión', candidature.reviewStatus],
    ['Observaciones', candidature.reviewComment || 'Sin observaciones'],
    ['Versión', `v${candidature.versionNumber}`],
    ['Cargado por', candidature.createdByName],
    [],
    [
      'Sublista',
      'Número de Orden',
      'Nombres y Apellidos',
      'Cédula de Identidad',
      'Teléfono',
      'Observación',
    ],
  ];

  for (const sub of candidature.sublists) {
    const orderedSlots = buildOrderedSublistSlots(sub, {
      moduleType: candidature.moduleType,
      departamento: candidature.departamento,
      seccional: candidature.seccional,
    });
    for (const slot of orderedSlots) {
      summaryRows.push([
        sub.label,
        slot.orden,
        slot.fullName,
        slot.cedula,
        slot.telefono,
        slot.observacion,
      ]);
    }
  }

  const wsConsolidated = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsConsolidated, 'Consolidado');

  candidature.sublists.forEach((sub, idx) => {
    const orderedSlots = buildOrderedSublistSlots(sub, {
      moduleType: candidature.moduleType,
      departamento: candidature.departamento,
      seccional: candidature.seccional,
    });
    const sheetData = orderedSlots.map((slot) => ({
      'Número de Orden': slot.orden,
      'Nombres y Apellidos': slot.fullName,
      'Cédula de Identidad': slot.cedula,
      Teléfono: slot.telefono,
      Observación: slot.observacion,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const sheetName = `${idx + 1}_${sub.label}`.replace(/[\\/*?:[\]]/g, '').slice(0, 28);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const safeName = candidature.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .slice(0, 40);
  XLSX.writeFile(wb, `SICCE_${safeName}_v${candidature.versionNumber}.xlsx`);
}

export function exportCandidatureReceiptToPdf(candidature: Candidature): void {
  if (!candidature.isComplete) {
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const movementName = candidature.movementName || DEFAULT_MOVEMENT_NAME;
  const receiptCode = getReceiptCode(candidature);
  const deliveryDateTime = formatElectoralDateTime(
    candidature.updatedAt || candidature.createdAt
  );

  // Official Receipt Header
  doc.setFillColor(185, 28, 28);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RECIBO OFICIAL DE RECEPCIÓN DE CANDIDATURAS', 14, 11);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${SYSTEM_NAME} · ANR Partido Colorado`, 14, 18);
  doc.setFont('helvetica', 'bold');
  doc.text(`Comprobante N°: ${receiptCode}   |   Fecha y Hora de Entrega: ${deliveryDateTime}`, 14, 24);

  // Metadata Box
  autoTable(doc, {
    startY: 33,
    head: [['Datos Generales de la Candidatura Completa', 'Detalle Registrado']],
    body: [
      ['Comprobante / Código', receiptCode],
      ['Fecha y Hora de Entrega', deliveryDateTime],
      ['Título de Candidatura', candidature.title],
      ['Módulo Electoral', MODULE_LABELS[candidature.moduleType] || candidature.moduleType],
      ['Movimiento / Corriente', movementName],
      ['Lista', `Lista ${candidature.listNumber}`],
      ['Departamento / Ámbito', candidature.departamento || 'Nacional'],
      ['Seccional', candidature.seccional || 'N/A'],
      [
        'Escaños Completados',
        `${candidature.totalCandidates} / ${candidature.requiredCandidates} (CANDIDATURA COMPLETA)`,
      ],
      ['Versión Registrada', `v${candidature.versionNumber}`],
      ['Estado Electoral', candidature.reviewStatus],
      ['Observaciones', candidature.reviewComment || 'Sin observaciones'],
      ['Responsable de Entrega', candidature.createdByName],
    ],
    theme: 'grid',
    styles: { fontSize: 8.2, cellPadding: 2, textColor: [15, 23, 42] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold', fillColor: [248, 250, 252] },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 1) {
        const rowRaw = hookData.row.raw as string[] | undefined;
        if (rowRaw && rowRaw[0] === 'Observaciones' && isActualObservation(rowRaw[1])) {
          hookData.cell.styles.textColor = [185, 28, 28];
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  let currentY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 100) + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('NÓMINA OFICIAL DE POSTULANTES RECIBIDOS', 14, currentY);
  currentY += 5;

  for (const sublist of candidature.sublists) {
    if (currentY > 245) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(185, 28, 28);
    doc.text(
      `${sublist.label} (${sublist.candidates.length}/${sublist.requiredSeats} postulantes)`,
      14,
      currentY
    );

    const orderedSlots = buildOrderedSublistSlots(sublist, {
      moduleType: candidature.moduleType,
      departamento: candidature.departamento,
      seccional: candidature.seccional,
    });

    const rows = orderedSlots.map((slot) => {
      const c = slot.candidate;
      const geo = c
        ? `${c.desc_dep || '-'} / ${c.desc_dis || '-'} / Sec. ${c.codigo_sec || '-'}`
        : 'Sin Registro';
      const dates = c
        ? `Nac: ${c.fecha_naci || '-'} | Afil: ${c.fecha_afil || '-'}`
        : 'Sin Registro';
      return [
        `#${slot.orden}`,
        slot.fullName,
        slot.cedula,
        slot.telefono,
        geo,
        dates,
        slot.observacion,
      ];
    });

    autoTable(doc, {
      startY: currentY + 2,
      head: [
        [
          'Orden',
          'Nombres y Apellidos',
          'Cédula',
          'Teléfono',
          'Dpto. / Dist. / Secc.',
          'Fechas Padrón',
          'Observación',
        ],
      ],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 7.2, cellPadding: 1.5, textColor: [15, 23, 42] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 36 },
        2: { cellWidth: 20 },
        3: { cellWidth: 22 },
        4: { cellWidth: 36 },
        5: { cellWidth: 30 },
        6: { cellWidth: 26 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 6) {
          const rowRaw = hookData.row.raw as string[] | undefined;
          if (rowRaw && isActualObservation(rowRaw[6])) {
            hookData.cell.styles.textColor = [185, 28, 28];
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
    currentY = (finalY ?? currentY + 20) + 7;
  }

  // Signature Footer
  if (currentY > 250) {
    doc.addPage();
    currentY = 24;
  } else {
    currentY += 6;
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(18, currentY + 14, 92, currentY + 14);
  doc.line(118, currentY + 14, 192, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Entregado por: ${candidature.createdByName}`, 20, currentY + 19);
  doc.text('Recibido por: Mesa de Entrada Electoral ANR', 120, currentY + 19);
  doc.text(`Fecha y Hora: ${deliveryDateTime}`, 120, currentY + 24);

  const safeName = candidature.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .slice(0, 35);
  doc.save(`RECIBO_SICCE_${safeName}_v${candidature.versionNumber}.pdf`);
}

export function exportFiscalizacionReceiptToPdf(
  candidature: Candidature,
  docs: CandidatureDocument[],
  overrideChecklist?: FiscalizacionChecklist
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const movementName = candidature.movementName || DEFAULT_MOVEMENT_NAME;
  const evaluation = evaluateFiscalizacion(candidature, docs, overrideChecklist);
  const receiptCode = getFiscalizacionReceiptCode(candidature);
  const fiscalizacionDateTime = formatElectoralDateTime(
    evaluation.checklist.updatedAtIso || candidature.updatedAt || candidature.createdAt
  );
  const fiscalizadorName =
    evaluation.checklist.fiscalizadoPorName || candidature.createdByName;

  // Header
  doc.setFillColor(30, 41, 59); // Slate-800 institutional Tribunal bar
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFillColor(185, 28, 28);
  doc.rect(0, 0, 210, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RECIBO OFICIAL DE FISCALIZACIÓN DOCUMENTAL', 14, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${SYSTEM_NAME} · Tribunal Electoral Partidario ANR`, 14, 19);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Comprobante: ${receiptCode}   |   Fecha y Hora de Control: ${fiscalizacionDateTime}`,
    14,
    25
  );

  // Identification & Dictamen Table
  const dictamenLabel = evaluation.presentacionCompleta
    ? 'PRESENTACIÓN COMPLETA PARA EL TRIBUNAL'
    : 'PRESENTACIÓN PENDIENTE / INCOMPLETA';

  const metadataRows: string[][] = [
    ['Comprobante de Fiscalización', receiptCode],
    ['Fecha y Hora de Fiscalización', fiscalizacionDateTime],
    ['Candidatura Fiscalizada', candidature.title],
    ['Movimiento / Lista', `${movementName} · Lista ${candidature.listNumber} (v${candidature.versionNumber})`],
    [
      'Departamento / Seccional',
      `${candidature.departamento || 'Nacional'}${candidature.seccional ? ` · ${candidature.seccional}` : ''}`,
    ],
    [
      'Integridad de Escaños',
      `${candidature.totalCandidates} / ${candidature.requiredCandidates} (${candidature.isComplete ? 'Lista Completa' : 'Lista Incompleta'})`,
    ],
    [
      'Recaudos Documentales',
      `${evaluation.fulfilledCount} / ${evaluation.requiredCount} requisitos obligatorios cumplidos`,
    ],
    ['Dictamen Tribunal', dictamenLabel],
    ['Fiscalizado por', fiscalizadorName],
    [
      'Observaciones de Fiscalización',
      evaluation.checklist.observaciones?.trim() || 'Sin observaciones',
    ],
  ];

  autoTable(doc, {
    startY: 33,
    head: [['Constancia de Fiscalización Documental', 'Detalle Verificado']],
    body: metadataRows,
    theme: 'grid',
    styles: { fontSize: 8.2, cellPadding: 2, textColor: [15, 23, 42] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: 'bold', fillColor: [248, 250, 252] },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 1) {
        const rowRaw = hookData.row.raw as string[] | undefined;
        if (rowRaw && rowRaw[0] === 'Observaciones de Fiscalización' && isActualObservation(rowRaw[1])) {
          hookData.cell.styles.textColor = [185, 28, 28];
          hookData.cell.styles.fontStyle = 'bold';
        } else if (rowRaw && rowRaw[0] === 'Dictamen Tribunal') {
          hookData.cell.styles.textColor = evaluation.presentacionCompleta
            ? [4, 120, 87]
            : [185, 28, 28];
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  let currentY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 110) + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('DETALLE DE RECAUDOS DOCUMENTALES EXIGIDOS POR EL TRIBUNAL', 14, currentY);

  const itemRows = evaluation.items.map((item, idx) => [
    `${idx + 1}. ${item.label}`,
    item.required ? 'Obligatorio' : 'No aplica',
    item.required ? (item.fulfilled ? 'Cumplido' : 'Pendiente') : 'Exento',
    item.checked ? 'Sí' : 'No',
    item.attachedDocs.length > 0
      ? item.attachedDocs.map((d) => d.fileName).join(', ')
      : item.required
        ? item.checked
          ? 'Verificado en físico'
          : 'Sin adjuntos'
        : '—',
  ]);

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Requisito Documental', 'Exigibilidad', 'Estado', 'Mesa', 'Archivos Adjuntos / Respaldo']],
    body: itemRows,
    theme: 'grid',
    styles: { fontSize: 7.8, cellPadding: 2, textColor: [15, 23, 42] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 56, fontStyle: 'bold' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 62 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 2) {
        const val = String(hookData.cell.raw || '');
        if (val === 'Cumplido') {
          hookData.cell.styles.textColor = [4, 120, 87];
          hookData.cell.styles.fontStyle = 'bold';
        } else if (val === 'Pendiente') {
          hookData.cell.styles.textColor = [185, 28, 28];
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  currentY =
    ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 180) + 12;

  if (currentY > 250) {
    doc.addPage();
    currentY = 24;
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(18, currentY + 14, 92, currentY + 14);
  doc.line(118, currentY + 14, 192, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Presentado por: ${candidature.createdByName}`, 20, currentY + 19);
  doc.text(`Fiscalizado por: ${fiscalizadorName}`, 120, currentY + 19);
  doc.text(`Mesa de Fiscalización Tribunal · ${fiscalizacionDateTime}`, 120, currentY + 24);

  const safeName = candidature.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .slice(0, 35);
  doc.save(`RECIBO_FISCALIZACION_${safeName}_v${candidature.versionNumber}.pdf`);
}

export function exportConsolidatedCandidaturesToExcel(candidatures: Candidature[]): void {
  const wb = XLSX.utils.book_new();

  const summarySheetData = candidatures.map((c) => {
    const hasUnipersonal = c.sublists.some((s) => s.tipo === 'UNIPERSONAL');
    const fisc = c.fiscalizacion;
    const docsOk = Boolean(
      fisc &&
        fisc.pagoAportePartidario &&
        fisc.fotocopiaCedula &&
        (!hasUnipersonal || fisc.fotoCarnet3x4) &&
        fisc.aceptacionesTriplicado &&
        fisc.autenticacionAceptaciones
    );
    const presentacionCompleta = c.isComplete && docsOk;
    return {
      Título: c.title,
      Módulo: MODULE_LABELS[c.moduleType] || c.moduleType,
      Movimiento: c.movementName || DEFAULT_MOVEMENT_NAME,
      Lista: `Lista ${c.listNumber}`,
      Departamento: c.departamento || 'Nacional',
      Seccional: c.seccional || 'N/A',
      'Escaños Cargados': c.totalCandidates,
      'Escaños Requeridos': c.requiredCandidates,
      Completitud: c.isComplete ? 'Completa' : 'Incompleta',
      'Estado Revisión': c.reviewStatus,
      'Fiscalización Tribunal': presentacionCompleta ? 'Presentación Completa' : 'Pendiente',
      Observaciones: c.reviewComment || 'Sin observaciones',
      Versión: `v${c.versionNumber}`,
      'Responsable Carga': c.createdByName,
    };
  });

  const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_General');

  const detailRows: (string | number)[][] = [
    [
      'Candidatura',
      'Lista',
      'Módulo',
      'Sublista',
      'Número de Orden',
      'Nombres y Apellidos',
      'Cédula de Identidad',
      'Teléfono',
      'Observación',
    ],
  ];

  for (const c of candidatures) {
    for (const sub of c.sublists) {
      const slots = buildOrderedSublistSlots(sub, {
        moduleType: c.moduleType,
        departamento: c.departamento,
        seccional: c.seccional,
      });
      for (const slot of slots) {
        detailRows.push([
          c.title,
          `Lista ${c.listNumber}`,
          MODULE_LABELS[c.moduleType] || c.moduleType,
          sub.label,
          slot.orden,
          slot.fullName,
          slot.cedula,
          slot.telefono,
          slot.observacion,
        ]);
      }
    }
  }

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Nomina_Consolidada');

  XLSX.writeFile(wb, `SICCE_Informe_Consolidado_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
