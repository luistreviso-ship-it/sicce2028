import React from 'react';
import {
  X,
  ClipboardCheck,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
} from 'lucide-react';
import { evaluateFiscalizacion } from '../services/firestoreService';
import {
  Candidature,
  CandidatureDocument,
  DEFAULT_MOVEMENT_NAME,
  FiscalizacionChecklist,
  SYSTEM_NAME,
} from '../types/electoral';
import {
  exportFiscalizacionReceiptToPdf,
  formatElectoralDateTime,
  getFiscalizacionReceiptCode,
} from '../utils/exportReports';

interface FiscalizacionReceiptModalProps {
  candidature: Candidature;
  docs: CandidatureDocument[];
  checklist?: FiscalizacionChecklist;
  onClose: () => void;
}

export const FiscalizacionReceiptModal: React.FC<FiscalizacionReceiptModalProps> = ({
  candidature,
  docs,
  checklist,
  onClose,
}) => {
  const movementName = candidature.movementName || DEFAULT_MOVEMENT_NAME;
  const evaluation = evaluateFiscalizacion(candidature, docs, checklist);
  const receiptCode = getFiscalizacionReceiptCode(candidature);
  const fiscalizacionDateTime = formatElectoralDateTime(
    evaluation.checklist.updatedAtIso || candidature.updatedAt || candidature.createdAt
  );
  const fiscalizadorName =
    evaluation.checklist.fiscalizadoPorName || candidature.createdByName;
  const obsText = evaluation.checklist.observaciones?.trim() || '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white border-t-4 border-t-[#B91C1C] flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              {SYSTEM_NAME} · Tribunal Electoral Partidario ANR
            </p>
            <h2 className="text-base font-bold flex items-center gap-2 mt-0.5">
              <ClipboardCheck className="w-4 h-4 text-red-400 shrink-0" />
              Recibo Independiente de Fiscalización Documental
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportFiscalizacionReceiptToPdf(candidature, docs, checklist)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#B91C1C] text-white text-xs font-bold rounded-lg hover:bg-[#991B1B] cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar Recibo PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-slate-900 text-xs font-bold rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/90 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              aria-label="Cerrar recibo de fiscalización"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8FAFC] print:bg-white print:p-2">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 print:border-0">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#B91C1C]">
                  ANR Partido Colorado · Mesa de Fiscalización Tribunal Electoral
                </p>
                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                  CONSTANCIA / RECIBO DE FISCALIZACIÓN DOCUMENTAL
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Documento independiente de control documental previo a presentación al Tribunal
                </p>
              </div>
              <div className="text-right text-xs">
                <p className="font-mono font-bold text-slate-900">
                  Comprobante: {receiptCode}
                </p>
                <p className="font-mono text-slate-600 mt-0.5 tabular-nums">
                  Control: {fiscalizacionDateTime}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div>
                <span className="text-slate-500 block">Candidatura</span>
                <span className="font-bold text-slate-900">{candidature.title}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Movimiento / Lista</span>
                <span className="font-semibold text-slate-900">
                  {movementName} · Lista {candidature.listNumber} (v{candidature.versionNumber})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Departamento / Seccional</span>
                <span className="font-medium text-slate-900">
                  {candidature.departamento || 'Nacional'}
                  {candidature.seccional ? ` · ${candidature.seccional}` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Escaños Cargados</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {candidature.totalCandidates} / {candidature.requiredCandidates} (
                  {candidature.isComplete ? 'Completa' : 'Incompleta'})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Recaudos Tribunal</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {evaluation.fulfilledCount} / {evaluation.requiredCount} obligatorios
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Dictamen de Presentación</span>
                <span
                  className={`font-bold ${
                    evaluation.presentacionCompleta ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {evaluation.presentacionCompleta
                    ? 'PRESENTACIÓN COMPLETA'
                    : 'PRESENTACIÓN PENDIENTE'}
                </span>
              </div>
              {obsText && (
                <div className="sm:col-span-2 lg:col-span-3 pt-1 border-t border-slate-200">
                  <span className="text-slate-500 block">Observaciones de Fiscalización</span>
                  <span className="font-semibold text-red-700">{obsText}</span>
                </div>
              )}
            </div>

            {/* 5 Tribunal Requirements Table */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-900">
                Verificación de Requisitos Documentales Obligatorios
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-3">Requisito Documental</th>
                      <th className="py-2 px-3 text-center">Exigibilidad</th>
                      <th className="py-2 px-3 text-center">Estado</th>
                      <th className="py-2 px-3 text-center">Mesa</th>
                      <th className="py-2 px-3">Respaldo / Archivos Adjuntos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evaluation.items.map((item, idx) => (
                      <tr key={item.key}>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {idx + 1}. {item.label}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-600">
                          {item.required ? 'Obligatorio' : 'No aplica'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {!item.required ? (
                            <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                              <MinusCircle className="w-3.5 h-3.5" />
                              Exento
                            </span>
                          ) : item.fulfilled ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Cumplido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {item.checked ? 'Sí' : 'No'}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {item.attachedDocs.length > 0
                            ? item.attachedDocs.map((d) => d.fileName).join(', ')
                            : !item.required
                              ? '—'
                              : item.checked
                                ? 'Verificado en físico'
                                : 'Sin archivo adjunto'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs text-slate-700">
              <div className="pt-6 border-t border-slate-400">
                <p className="font-bold text-slate-900">Presentado por</p>
                <p>{candidature.createdByName}</p>
                <p className="font-mono text-slate-500 mt-0.5">{movementName}</p>
              </div>
              <div className="pt-6 border-t border-slate-400">
                <p className="font-bold text-slate-900">
                  Fiscalizado por · Tribunal Electoral ANR
                </p>
                <p>{fiscalizadorName}</p>
                <p className="font-mono text-slate-500 mt-0.5 tabular-nums">
                  {receiptCode} · {fiscalizacionDateTime}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
