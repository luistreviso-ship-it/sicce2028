import React from 'react';
import { X, FileCheck2, Printer, Download } from 'lucide-react';
import {
  Candidature,
  DEFAULT_MOVEMENT_NAME,
  SYSTEM_NAME,
} from '../types/electoral';
import {
  exportCandidatureReceiptToPdf,
  formatElectoralDateTime,
  getReceiptCode,
} from '../utils/exportReports';
import { buildOrderedSublistSlots } from '../utils/validation';

interface CandidatureReceiptModalProps {
  candidature: Candidature;
  onClose: () => void;
}

export const CandidatureReceiptModal: React.FC<CandidatureReceiptModalProps> = ({
  candidature,
  onClose,
}) => {
  const movementName = candidature.movementName || DEFAULT_MOVEMENT_NAME;
  const receiptCode = getReceiptCode(candidature);
  const deliveryDateTime = formatElectoralDateTime(
    candidature.updatedAt || candidature.createdAt
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#B91C1C] text-white flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-100">
              {SYSTEM_NAME} · ANR Partido Colorado
            </p>
            <h2 className="text-base font-bold flex items-center gap-2 mt-0.5">
              <FileCheck2 className="w-4 h-4 shrink-0" />
              Recibo Oficial de Recepción de Candidaturas
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportCandidatureReceiptToPdf(candidature)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-[#B91C1C] text-xs font-bold rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar Recibo PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/90 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              aria-label="Cerrar recibo"
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
                  ANR Partido Colorado · Tribunal / Mesa de Entrada Electoral
                </p>
                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                  RECIBO DE RECEPCIÓN DE CANDIDATURAS COMPLETAS
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {SYSTEM_NAME}
                </p>
              </div>
              <div className="text-right text-xs">
                <p className="font-mono font-bold text-slate-900">
                  Comprobante: {receiptCode}
                </p>
                <p className="font-mono text-slate-700 mt-0.5 tabular-nums">
                  Fecha y Hora de Entrega: {deliveryDateTime}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div>
                <span className="text-slate-500 block">Candidatura</span>
                <span className="font-bold text-slate-900">{candidature.title}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Movimiento / Corriente Interna</span>
                <span className="font-semibold text-slate-900">{movementName}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Lista / Versión</span>
                <span className="font-bold text-slate-900">
                  Lista {candidature.listNumber} · Versión v{candidature.versionNumber}
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
                <span className="text-slate-500 block">Escaños Completados</span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums">
                  {candidature.totalCandidates} / {candidature.requiredCandidates} (COMPLETA)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Estado y Responsable de Entrega</span>
                <span className="font-semibold text-slate-900">
                  {candidature.reviewStatus} · {candidature.createdByName}
                </span>
              </div>
              {candidature.reviewComment && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <span className="text-slate-500 block">Observaciones</span>
                  <span className="font-semibold text-red-700">{candidature.reviewComment}</span>
                </div>
              )}
            </div>

            {/* All Postulantes */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900">
                Nómina Completa de Postulantes Recibidos
              </h4>
              {candidature.sublists.map((sub) => {
                const slots = buildOrderedSublistSlots(sub, {
                  moduleType: candidature.moduleType,
                  departamento: candidature.departamento,
                  seccional: candidature.seccional,
                });
                return (
                  <div key={sub.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>{sub.label}</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {sub.candidates.length}/{sub.requiredSeats} escaños
                      </span>
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <th className="py-2 px-2.5 w-16">Orden</th>
                            <th className="py-2 px-2.5">Nombres y Apellidos</th>
                            <th className="py-2 px-2.5">Cédula de Identidad</th>
                            <th className="py-2 px-2.5">Teléfono</th>
                            <th className="py-2 px-2.5">Dpto. / Dist. / Secc.</th>
                            <th className="py-2 px-2.5">F. Nac. / F. Afil.</th>
                            <th className="py-2 px-2.5">Observación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {slots.map((slot) => {
                            const c = slot.candidate;
                            return (
                              <tr key={`${sub.key}-${slot.orden}`}>
                                <td className="py-1.5 px-2.5 font-mono font-bold tabular-nums">
                                  #{slot.orden}
                                </td>
                                <td className="py-1.5 px-2.5 font-medium text-slate-900">
                                  {slot.fullName}
                                </td>
                                <td className="py-1.5 px-2.5 font-mono tabular-nums">
                                  {slot.cedula}
                                </td>
                                <td className="py-1.5 px-2.5 font-mono">
                                  {slot.telefono}
                                </td>
                                <td className="py-1.5 px-2.5 text-slate-600">
                                  {c
                                    ? `${c.desc_dep || '-'} · ${c.desc_dis || '-'} · Sec. ${c.codigo_sec || '-'}`
                                    : 'Sin Registro'}
                                </td>
                                <td className="py-1.5 px-2.5 font-mono text-slate-600 tabular-nums">
                                  {c
                                    ? `${c.fecha_naci || '-'} / ${c.fecha_afil || '-'}`
                                    : 'Sin Registro'}
                                </td>
                                <td
                                  className={`py-1.5 px-2.5 ${
                                    !slot.isEmpty && slot.observacion !== 'Sin observación'
                                      ? 'text-red-700 font-semibold'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {slot.observacion}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Signature block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs text-slate-700">
              <div className="pt-6 border-t border-slate-400">
                <p className="font-bold text-slate-900">Entregado por</p>
                <p>{candidature.createdByName}</p>
                <p className="font-mono text-slate-500 mt-0.5">Movimiento: {movementName}</p>
              </div>
              <div className="pt-6 border-t border-slate-400">
                <p className="font-bold text-slate-900">
                  Recibido por · Mesa de Entrada Electoral ANR
                </p>
                <p className="font-mono tabular-nums">
                  Fecha y Hora de Entrega: {deliveryDateTime}
                </p>
                <p className="font-mono text-slate-500 mt-0.5">Comprobante: {receiptCode}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
