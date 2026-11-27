import React from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Save,
  XCircle,
  Lock,
  Eye,
  FileCheck2,
} from 'lucide-react';
import { LISTA_OPTIONS } from '../data/paraguayElectoralData';
import { Candidature, DEFAULT_MOVEMENT_NAME } from '../types/electoral';
import { CandidatureValidationSummary } from '../utils/validation';

interface CandidatureSummaryBarProps {
  title: string;
  onTitleChange?: (v: string) => void;
  movementName: string;
  onMovementNameChange: (v: string) => void;
  listNumber: string;
  onListNumberChange: (v: string) => void;
  changeNote: string;
  onChangeNoteChange: (v: string) => void;
  observationNote: string;
  onObservationNoteChange: (v: string) => void;
  isEditing: boolean;
  validation: CandidatureValidationSummary;
  saving: boolean;
  readOnly: boolean;
  readOnlyReason?: string;
  onSave: () => void;
  onOpenPreview: () => void;
  onCancelEdit?: () => void;
  saveSuccessMessage?: string | null;
  saveErrorMessage?: string | null;
  savedReceiptCandidature?: Candidature | null;
  onOpenReceipt?: () => void;
}

export const CandidatureSummaryBar: React.FC<CandidatureSummaryBarProps> = ({
  title,
  onTitleChange,
  movementName,
  onMovementNameChange,
  listNumber,
  onListNumberChange,
  changeNote,
  onChangeNoteChange,
  observationNote,
  onObservationNoteChange,
  isEditing,
  validation,
  saving,
  readOnly,
  readOnlyReason,
  onSave,
  onOpenPreview,
  onCancelEdit,
  saveSuccessMessage,
  saveErrorMessage,
  savedReceiptCandidature,
  onOpenReceipt,
}) => {
  const isObservedSave = validation.canSave && validation.hasObservations;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex-1 min-w-[240px]">
          <p className="text-xs font-semibold text-[#B91C1C]">
            {isEditing ? 'Editando Candidatura Existente' : 'Resumen de Carga y Confirmación'}
          </p>
          {onTitleChange && !readOnly ? (
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:border-[#B91C1C]"
            />
          ) : (
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">{title}</h2>
          )}
        </div>

        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-slate-500 block">Total Escaños Requeridos</span>
            <span className="font-mono font-bold text-slate-900 text-base tabular-nums">
              {validation.totalRequired}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Candidatos Cargados</span>
            <span className="font-mono font-bold text-slate-900 text-base tabular-nums">
              {validation.totalLoaded}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Estado del Paquete</span>
            {validation.valid ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 text-sm mt-0.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Completa
              </span>
            ) : isObservedSave ? (
              <span className="inline-flex items-center gap-1 font-semibold text-red-700 text-sm mt-0.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {!validation.isComplete
                  ? 'Incompleta (En Observación)'
                  : 'En Observación Automática'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-red-700 text-sm mt-0.5">
                <AlertOctagon className="w-4 h-4 shrink-0" />
                Pendiente de Carga
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Movimiento, Lista (A, B, C, D) & Version Note */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-5">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Movimiento / Corriente Interna
          </label>
          <input
            type="text"
            disabled={readOnly}
            value={movementName}
            onChange={(e) => onMovementNameChange(e.target.value)}
            placeholder={DEFAULT_MOVEMENT_NAME}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:border-[#B91C1C] disabled:bg-slate-50"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Lista (Por defecto Lista A)
          </label>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {LISTA_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={readOnly}
                onClick={() => onListNumberChange(opt)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                  listNumber === opt
                    ? 'bg-[#B91C1C] text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Nota de Versión
          </label>
          <input
            type="text"
            disabled={readOnly}
            value={changeNote}
            onChange={(e) => onChangeNoteChange(e.target.value)}
            placeholder="Ej: Presentación inicial oficial"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:border-[#B91C1C] disabled:bg-slate-50"
          />
        </div>
      </div>

      {/* Sublist completeness checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {validation.sublistResults.map((res) => (
          <div
            key={res.key}
            className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              res.isComplete
                ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                : res.loadedCount > 0
                  ? 'border-amber-200 bg-amber-50/60 text-amber-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            <span className="truncate font-medium">{res.label}</span>
            <span className="font-mono font-bold tabular-nums shrink-0">
              {res.loadedCount}/{res.requiredSeats}
            </span>
          </div>
        ))}
      </div>

      {/* Blocking errors */}
      {validation.blockingErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 space-y-1.5">
          <p className="text-xs font-bold text-red-900 flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            Errores bloqueantes que deben corregirse antes de grabar ({validation.blockingErrors.length}):
          </p>
          <ul className="list-disc list-inside text-xs text-red-800 space-y-0.5 max-h-36 overflow-y-auto">
            {validation.blockingErrors.slice(0, 12).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {validation.blockingErrors.length > 12 && (
              <li>... y {validation.blockingErrors.length - 12} validación(es) adicional(es).</li>
            )}
          </ul>
        </div>
      )}

      {/* Automatic Observation Warning (Age Minimum, Seccional and/or Incomplete Seats) */}
      {validation.hasObservations && validation.warnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1">
              <p className="font-bold text-red-800">
                {(validation.ageObservations.length > 0 ||
                  validation.seccionalObservations.length > 0) &&
                !validation.isComplete
                  ? 'Candidatura en Observación automática (validaciones de padrón e incompleta):'
                  : validation.seccionalObservations.length > 0
                    ? 'Observación automática de Seccional ANR (candidato figura en otra seccional): se grabará en estado OBSERVADA.'
                    : validation.ageObservations.length > 0
                      ? 'Observación automática por edad mínima (fecha_naci en PadrónANR): se grabará en estado OBSERVADA.'
                      : 'Candidatura incompleta: puede grabarse con estado OBSERVADA y detalle de faltantes.'}
              </p>
              <ul className="list-disc list-inside text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                {validation.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {validation.warnings.length > 8 && (
                  <li>... y {validation.warnings.length - 8} observación(es) adicional(es).</li>
                )}
              </ul>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-red-800 mb-1">
              Observación de la Candidatura (se guardará en el dictamen):
            </label>
            <textarea
              rows={2}
              disabled={readOnly}
              value={observationNote}
              onChange={(e) => onObservationNoteChange(e.target.value)}
              placeholder={validation.autoObservationText || 'Detalle de observaciones automáticas...'}
              className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-xs text-red-800 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:bg-slate-50"
            />
          </div>
        </div>
      )}

      {saveSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-3 font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{saveSuccessMessage}</span>
          </div>
          {savedReceiptCandidature?.isComplete && onOpenReceipt && (
            <button
              type="button"
              onClick={onOpenReceipt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              Ver / Descargar Recibo de Recepción
            </button>
          )}
        </div>
      )}

      {saveErrorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 text-xs text-red-900 flex items-center gap-2 font-medium">
          <AlertOctagon className="w-4 h-4 text-red-700 shrink-0" />
          <span>{saveErrorMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
        {readOnly ? (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Lock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              {readOnlyReason || 'Su usuario no posee permisos habilitados para esta operación.'}
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-500">
            Al confirmar se generará una nueva versión histórica, auditoría y notificación.
          </span>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={validation.totalLoaded === 0}
            onClick={onOpenPreview}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 bg-white text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
          >
            <Eye className="w-4 h-4 text-[#B91C1C]" />
            Vista Previa / Editar Exportación
          </button>

          {isEditing && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <XCircle className="w-4 h-4" />
              Cancelar Edición
            </button>
          )}

          {!readOnly && (
            <button
              type="button"
              disabled={!validation.canSave || saving}
              onClick={onSave}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isObservedSave
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-[#B91C1C] hover:bg-[#991B1B]'
              }`}
            >
              <Save className="w-4 h-4 shrink-0" />
              {saving
                ? 'Guardando en Base Electoral...'
                : isObservedSave
                  ? !validation.isComplete
                    ? isEditing
                      ? 'Guardar Actualización Incompleta (Observada)'
                      : 'Guardar Incompleta (Con Observaciones)'
                    : isEditing
                      ? 'Guardar Actualización en Observación'
                      : 'Guardar en Observación Automática'
                  : isEditing
                    ? 'Confirmar Actualización'
                    : 'Confirmar y Guardar Candidatura'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
