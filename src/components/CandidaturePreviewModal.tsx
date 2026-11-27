import React, { useState } from 'react';
import {
  X,
  FileText,
  FileSpreadsheet,
  Check,
  Pencil,
  FileCheck2,
} from 'lucide-react';
import {
  Candidature,
  CandidatureSublist,
  DEFAULT_MOVEMENT_NAME,
  SYSTEM_NAME,
} from '../types/electoral';
import {
  exportCandidatureReceiptToPdf,
  exportCandidatureToExcel,
  exportCandidatureToPdf,
} from '../utils/exportReports';
import { buildOrderedSublistSlots } from '../utils/validation';

interface CandidaturePreviewModalProps {
  candidature: Candidature;
  editable?: boolean;
  onApplyDraftChanges?: (updated: Candidature) => void;
  onClose: () => void;
}

export const CandidaturePreviewModal: React.FC<CandidaturePreviewModalProps> = ({
  candidature,
  editable = true,
  onApplyDraftChanges,
  onClose,
}) => {
  const [draft, setDraft] = useState<Candidature>(() => ({
    ...candidature,
    movementName: candidature.movementName || DEFAULT_MOVEMENT_NAME,
    sublists: candidature.sublists.map((s) => ({
      ...s,
      candidates: s.candidates.map((c) => ({
        ...c,
        telefono: c.telefono || '',
        observacion: c.observacion || '',
      })),
    })),
  }));

  const updateField = <K extends keyof Candidature>(key: K, value: Candidature[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateCandidateField = (
    subIdx: number,
    numeroCed: string,
    field: 'apellido' | 'nombre' | 'telefono' | 'observacion',
    value: string
  ) => {
    setDraft((prev) => {
      const nextSublists: CandidatureSublist[] = prev.sublists.map((sub, idx) => {
        if (idx !== subIdx) return sub;
        return {
          ...sub,
          candidates: sub.candidates.map((cand) =>
            cand.numero_ced === numeroCed ? { ...cand, [field]: value } : cand
          ),
        };
      });
      return { ...prev, sublists: nextSublists };
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#B91C1C] text-white flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-100">
              {SYSTEM_NAME}
            </p>
            <h2 className="text-base font-bold truncate flex items-center gap-2 mt-0.5">
              <Pencil className="w-4 h-4 shrink-0" />
              Vista Previa y Edición para Exportación
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {draft.isComplete && (
              <button
                type="button"
                onClick={() => exportCandidatureReceiptToPdf(draft)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 text-slate-950 text-xs font-bold rounded-lg hover:bg-amber-300 cursor-pointer whitespace-nowrap"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                Recibo Recepción PDF
              </button>
            )}
            <button
              type="button"
              onClick={() => exportCandidatureToPdf(draft)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#B91C1C] text-xs font-bold rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={() => exportCandidatureToExcel(draft)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Exportar Excel
            </button>
            {editable && onApplyDraftChanges && (
              <button
                type="button"
                onClick={() => {
                  onApplyDraftChanges(draft);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                Aplicar Cambios
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/90 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              aria-label="Cerrar vista previa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8FAFC]">
          {/* Editable Metadata */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-900">
                Datos de Encabezado (Editables en Vista Previa y Exportación)
              </span>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded border ${
                  draft.isComplete && draft.reviewStatus !== 'OBSERVADA'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {draft.isComplete
                  ? draft.reviewStatus === 'OBSERVADA'
                    ? `Completa · En Observación (${draft.totalCandidates}/${draft.requiredCandidates})`
                    : `Completa (${draft.totalCandidates}/${draft.requiredCandidates})`
                  : `Incompleta con Observaciones (${draft.totalCandidates}/${draft.requiredCandidates})`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Título de la Candidatura
                </label>
                <input
                  type="text"
                  disabled={!editable}
                  value={draft.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lista</label>
                <input
                  type="text"
                  disabled={!editable}
                  value={draft.listNumber}
                  onChange={(e) => updateField('listNumber', e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 font-semibold"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre del Movimiento
                </label>
                <input
                  type="text"
                  disabled={!editable}
                  value={draft.movementName}
                  onChange={(e) => updateField('movementName', e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Departamento
                </label>
                <input
                  type="text"
                  disabled={!editable}
                  value={draft.departamento}
                  onChange={(e) => updateField('departamento', e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Seccional</label>
                <input
                  type="text"
                  disabled={!editable}
                  value={draft.seccional}
                  onChange={(e) => updateField('seccional', e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-semibold text-red-700 mb-1">
                  Observaciones
                </label>
                <input
                  type="text"
                  disabled={!editable}
                  value={draft.reviewComment}
                  onChange={(e) => updateField('reviewComment', e.target.value)}
                  placeholder="Observación de revisión o candidatura incompleta..."
                  className={`w-full px-3 py-1.5 border rounded-lg bg-white ${
                    draft.reviewComment
                      ? 'border-red-300 text-red-700 font-medium'
                      : 'border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Sublists Ordered Ascending with Exact 5 Columns */}
          {draft.sublists.map((sub, subIdx) => {
            const orderedSlots = buildOrderedSublistSlots(sub, {
              moduleType: draft.moduleType,
              departamento: draft.departamento,
              seccional: draft.seccional,
            });
            return (
              <div
                key={sub.key}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
                  <span>{sub.label}</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    {sub.candidates.length} / {sub.requiredSeats} escaños
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2 px-2.5 w-28">Número de Orden</th>
                        <th className="py-2 px-2.5">Nombres y Apellidos</th>
                        <th className="py-2 px-2.5">Cédula de Identidad</th>
                        <th className="py-2 px-2.5">Teléfono</th>
                        <th className="py-2 px-2.5">Observación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderedSlots.map((slot) => {
                        if (slot.isEmpty || !slot.candidate) {
                          return (
                            <tr key={`empty-${sub.key}-${slot.orden}`} className="bg-slate-50/50">
                              <td className="py-1.5 px-2.5 font-mono font-bold text-slate-500 tabular-nums">
                                #{slot.orden}
                              </td>
                              <td className="py-1.5 px-2.5 italic text-slate-500">Sin Registro</td>
                              <td className="py-1.5 px-2.5 italic text-slate-400">Sin Registro</td>
                              <td className="py-1.5 px-2.5 italic text-slate-400">Sin Registro</td>
                              <td className="py-1.5 px-2.5 italic text-slate-400">Sin Registro</td>
                            </tr>
                          );
                        }
                        const cand = slot.candidate;
                        return (
                          <tr key={`${cand.numero_ced}-${slot.orden}`} className="hover:bg-slate-50/70">
                            <td className="py-1.5 px-2.5 font-mono font-bold tabular-nums">
                              #{slot.orden}
                            </td>
                            <td className="py-1.5 px-2">
                              {editable ? (
                                <div className="flex flex-wrap gap-1.5">
                                  <input
                                    type="text"
                                    value={cand.nombre}
                                    onChange={(e) =>
                                      updateCandidateField(
                                        subIdx,
                                        cand.numero_ced,
                                        'nombre',
                                        e.target.value
                                      )
                                    }
                                    placeholder="Nombres"
                                    className="w-32 px-2 py-1 border border-slate-200 rounded bg-white"
                                  />
                                  <input
                                    type="text"
                                    value={cand.apellido}
                                    onChange={(e) =>
                                      updateCandidateField(
                                        subIdx,
                                        cand.numero_ced,
                                        'apellido',
                                        e.target.value
                                      )
                                    }
                                    placeholder="Apellidos"
                                    className="w-32 px-2 py-1 border border-slate-200 rounded bg-white"
                                  />
                                </div>
                              ) : (
                                <span className="font-medium text-slate-900">{slot.fullName}</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono tabular-nums text-slate-700">
                              {cand.numero_ced}
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                disabled={!editable}
                                value={cand.telefono || ''}
                                onChange={(e) =>
                                  updateCandidateField(
                                    subIdx,
                                    cand.numero_ced,
                                    'telefono',
                                    e.target.value
                                  )
                                }
                                placeholder="0981..."
                                className="w-32 px-2 py-1 border border-slate-200 rounded bg-white font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              {editable ? (
                                <div className="space-y-1">
                                  {(slot.hasAgeObservation || slot.hasSeccionalObservation) && (
                                    <span className="inline-block text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                      {slot.observacion}
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    value={cand.observacion || ''}
                                    onChange={(e) =>
                                      updateCandidateField(
                                        subIdx,
                                        cand.numero_ced,
                                        'observacion',
                                        e.target.value
                                      )
                                    }
                                    placeholder="Sin observación"
                                    className={`w-full min-w-[160px] px-2 py-1 border rounded bg-white ${
                                      (cand.observacion || '').trim()
                                        ? 'border-red-300 text-red-700 font-medium'
                                        : 'border-slate-200 text-slate-800'
                                    }`}
                                  />
                                </div>
                              ) : (
                                <span
                                  className={
                                    slot.observacion !== 'Sin observación' && !slot.isEmpty
                                      ? 'text-red-700 font-semibold'
                                      : 'text-slate-700'
                                  }
                                >
                                  {slot.observacion}
                                </span>
                              )}
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
      </div>
    </div>
  );
};
