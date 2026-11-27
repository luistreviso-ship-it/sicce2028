import React, { useState } from 'react';
import { History, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { AuditLog, CandidatureModuleType, ListVersion } from '../../types/electoral';
import { buildOrderedSublistSlots } from '../../utils/validation';

interface AuditAndVersionsViewProps {
  auditLogs: AuditLog[];
  listVersions: ListVersion[];
}

function formatFirestoreTime(ts: unknown): string {
  if (!ts) return 'Reciente';
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    const d = new Date(Number((ts as { seconds: number }).seconds) * 1000);
    return d.toLocaleString('es-PY', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(ts);
}

export const AuditAndVersionsView: React.FC<AuditAndVersionsViewProps> = ({
  auditLogs,
  listVersions,
}) => {
  const [tab, setTab] = useState<'auditoria' | 'versiones'>('auditoria');
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(
    listVersions[0]?.id || null
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('auditoria')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              tab === 'auditoria' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Registro de Auditoría ({auditLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('versiones')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              tab === 'versiones' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Versionado Histórico de Listas ({listVersions.length})
          </button>
        </div>
      </div>

      {tab === 'auditoria' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {auditLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No hay eventos de auditoría registrados todavía.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Fecha / Hora</th>
                    <th className="py-2.5 px-4">Usuario / Rol</th>
                    <th className="py-2.5 px-4">Acción</th>
                    <th className="py-2.5 px-4">Detalle de Operación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatFirestoreTime(log.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="font-semibold text-slate-900">{log.actorName}</span>
                        <span className="text-slate-500 ml-1.5">· {log.actorRole}</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-[#B91C1C] whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{log.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {listVersions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
              Aún no se han guardado versiones históricas de listas.
            </div>
          ) : (
            listVersions.map((ver) => {
              const isOpen = expandedVersionId === ver.id;
              return (
                <div
                  key={ver.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedVersionId(isOpen ? null : ver.id)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          v{ver.versionNumber} — {ver.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          Nota: {ver.changeNote} · Por {ver.createdByName}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 text-xs">
                      <span className="font-mono font-bold text-slate-800 tabular-nums block">
                        {ver.totalCandidates} escaños
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {formatFirestoreTime(ver.createdAt)}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-4 bg-slate-50/50">
                      {ver.snapshotSublists.map((sub) => {
                        const slots = buildOrderedSublistSlots(sub, {
                          moduleType: ver.moduleType as CandidatureModuleType,
                        });
                        return (
                          <div key={sub.key} className="space-y-1.5">
                            <p className="text-xs font-bold text-slate-800">
                              {sub.label} ({sub.candidates.length}/{sub.requiredSeats})
                            </p>
                            <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                    <th className="py-1.5 px-2.5 w-28">Número de Orden</th>
                                    <th className="py-1.5 px-2.5">Nombres y Apellidos</th>
                                    <th className="py-1.5 px-2.5">Cédula de Identidad</th>
                                    <th className="py-1.5 px-2.5">Teléfono</th>
                                    <th className="py-1.5 px-2.5">Observación</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {slots.map((slot) => (
                                    <tr key={`${sub.key}-${slot.orden}`}>
                                      <td className="py-1.5 px-2.5 font-mono font-bold tabular-nums">
                                        #{slot.orden}
                                      </td>
                                      <td
                                        className={`py-1.5 px-2.5 ${
                                          slot.isEmpty
                                            ? 'italic text-slate-500'
                                            : 'text-slate-900 font-medium'
                                        }`}
                                      >
                                        {slot.fullName}
                                      </td>
                                      <td className="py-1.5 px-2.5 font-mono tabular-nums">
                                        {slot.cedula}
                                      </td>
                                      <td className="py-1.5 px-2.5 font-mono text-slate-700">
                                        {slot.telefono}
                                      </td>
                                      <td
                                        className={`py-1.5 px-2.5 ${
                                          !slot.isEmpty && slot.observacion !== 'Sin observación'
                                            ? 'text-red-700 font-semibold'
                                            : 'text-slate-600'
                                        }`}
                                      >
                                        {slot.observacion}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
