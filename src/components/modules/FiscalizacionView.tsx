import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Trash2,
  Save,
  FileCheck2,
  Search,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import {
  evaluateFiscalizacion,
  fetchCandidatureDocuments,
  FiscalizacionBooleanKey,
  hasAltaPermission,
  hasBajaPermission,
  hasModificacionPermission,
  isBootstrappedAdminEmail,
  normalizeFiscalizacionChecklist,
  removeCandidatureDocument,
  saveCandidatureFiscalizacion,
  uploadCandidatureDocument,
} from '../../services/firestoreService';
import {
  AppRoute,
  Candidature,
  CandidatureDocument,
  DocumentType,
  FiscalizacionChecklist,
  UserProfile,
} from '../../types/electoral';
import { FiscalizacionReceiptModal } from '../FiscalizacionReceiptModal';

interface FiscalizacionViewProps {
  candidatures: Candidature[];
  currentUser: UserProfile;
  staffUids: string[];
  onRefresh: () => void;
  onNavigate?: (route: AppRoute) => void;
}

export const FiscalizacionView: React.FC<FiscalizacionViewProps> = ({
  candidatures,
  currentUser,
  staffUids,
  onRefresh,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('TODOS');
  const [statusFilter, setStatusFilter] = useState<
    'TODAS' | 'PRESENTACION_COMPLETA' | 'PENDIENTE'
  >('TODAS');
  const [selectedId, setSelectedId] = useState<string>(candidatures[0]?.id || '');

  const [docs, setDocs] = useState<CandidatureDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [checklist, setChecklist] = useState<FiscalizacionChecklist>(() =>
    normalizeFiscalizacionChecklist()
  );
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const summaryStats = useMemo(() => {
    let completas = 0;
    let conUnipersonal = 0;
    for (const c of candidatures) {
      const ev = evaluateFiscalizacion(c, []);
      if (ev.presentacionCompleta) completas++;
      if (ev.hasUnipersonal) conUnipersonal++;
    }
    return {
      total: candidatures.length,
      completas,
      pendientes: candidatures.length - completas,
      conUnipersonal,
    };
  }, [candidatures]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidatures.filter((c) => {
      if (moduleFilter !== 'TODOS' && c.moduleType !== moduleFilter) return false;
      const ev = evaluateFiscalizacion(c, []);
      if (statusFilter === 'PRESENTACION_COMPLETA' && !ev.presentacionCompleta) return false;
      if (statusFilter === 'PENDIENTE' && ev.presentacionCompleta) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.movementName || '').toLowerCase().includes(q) ||
        c.listNumber.toLowerCase().includes(q) ||
        c.departamento.toLowerCase().includes(q) ||
        c.seccional.toLowerCase().includes(q)
      );
    });
  }, [candidatures, moduleFilter, statusFilter, search]);

  const selected = useMemo(
    () => filtered.find((c) => c.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  useEffect(() => {
    setSaveMessage(null);
    setErrorMessage(null);
    if (!selected) {
      setDocs([]);
      setChecklist(normalizeFiscalizacionChecklist());
      return;
    }
    setChecklist(normalizeFiscalizacionChecklist(selected.fiscalizacion));
    setLoadingDocs(true);
    const isBootAdmin = isBootstrappedAdminEmail(currentUser.email);
    fetchCandidatureDocuments(selected.id, currentUser.uid, isBootAdmin)
      .then(setDocs)
      .finally(() => setLoadingDocs(false));
  }, [selected, currentUser]);

  const evaluation = useMemo(() => {
    if (!selected) return null;
    return evaluateFiscalizacion(selected, docs, checklist);
  }, [selected, docs, checklist]);

  const canFiscalizar =
    Boolean(selected) &&
    (hasAltaPermission(currentUser) || hasModificacionPermission(currentUser)) &&
    (currentUser.role === 'admin' ||
      currentUser.role === 'revisor' ||
      selected!.createdByUid === currentUser.uid ||
      selected!.authorizedUids.includes(currentUser.uid));

  const canAttachDocs =
    Boolean(selected) &&
    (hasAltaPermission(currentUser) || hasModificacionPermission(currentUser)) &&
    (currentUser.role === 'admin' ||
      currentUser.role === 'revisor' ||
      selected!.createdByUid === currentUser.uid);

  const canDeleteDocs =
    Boolean(selected) &&
    (hasBajaPermission(currentUser) ||
      (currentUser.role === 'operador' &&
        hasModificacionPermission(currentUser) &&
        selected!.createdByUid === currentUser.uid &&
        selected!.reviewStatus !== 'APROBADA'));

  const handleToggleItem = (key: FiscalizacionBooleanKey) => {
    if (!canFiscalizar) return;
    setSaveMessage(null);
    setChecklist((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleUploadRequirementFile = async (
    reqKey: FiscalizacionBooleanKey,
    docType: DocumentType,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selected || !canAttachDocs) return;
    setErrorMessage(null);
    setSaveMessage(null);
    if (file.size > 450 * 1024) {
      setErrorMessage(
        'El archivo supera el límite de 450 KB permitido para almacenamiento documental.'
      );
      e.target.value = '';
      return;
    }

    setUploadingKey(reqKey);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
        reader.readAsDataURL(file);
      });

      const uploaded = await uploadCandidatureDocument({
        candidature: selected,
        docType,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl,
        actor: currentUser,
        staffUids,
      });
      setDocs((prev) => [uploaded, ...prev]);

      // Auto-mark this requirement verified and persist checklist if allowed
      const nextChecklist: FiscalizacionChecklist = {
        ...checklist,
        [reqKey]: true,
      };
      setChecklist(nextChecklist);
      if (canFiscalizar) {
        await saveCandidatureFiscalizacion(selected, nextChecklist, currentUser, staffUids);
        onRefresh();
      }
      setSaveMessage(`Documento "${file.name}" adjuntado y requisito marcado como cumplido.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al subir archivo.');
    } finally {
      setUploadingKey(null);
      e.target.value = '';
    }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!selected || !canDeleteDocs) return;
    await removeCandidatureDocument(selected.id, docId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleSaveFiscalizacion = async () => {
    if (!selected || !canFiscalizar) return;
    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);
    try {
      // Sync attached docs as checked in stored checklist so summary views reflect completeness accurately
      const syncedChecklist: FiscalizacionChecklist = {
        ...checklist,
        pagoAportePartidario:
          checklist.pagoAportePartidario ||
          docs.some((d) => d.docType === 'PAGO_APORTE_PARTIDARIO'),
        fotocopiaCedula:
          checklist.fotocopiaCedula || docs.some((d) => d.docType === 'CEDULA_IDENTIDAD'),
        fotoCarnet3x4:
          checklist.fotoCarnet3x4 || docs.some((d) => d.docType === 'FOTO_CARNET_3X4'),
        aceptacionesTriplicado:
          checklist.aceptacionesTriplicado ||
          docs.some((d) => d.docType === 'ACEPTACION_TRIPLICADO'),
        autenticacionAceptaciones:
          checklist.autenticacionAceptaciones ||
          docs.some((d) => d.docType === 'AUTENTICACION_ACEPTACION'),
      };

      const saved = await saveCandidatureFiscalizacion(
        selected,
        syncedChecklist,
        currentUser,
        staffUids
      );
      setChecklist(saved);
      const nextEval = evaluateFiscalizacion(selected, docs, saved);
      setSaveMessage(
        nextEval.presentacionCompleta
          ? `Fiscalización guardada: "${selected.title}" cumple todos los requisitos y es PRESENTACIÓN COMPLETA para el Tribunal.`
          : `Fiscalización guardada (${nextEval.fulfilledCount}/${nextEval.requiredCount} documentos obligatorios verificados).`
      );
      onRefresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'No se pudo guardar la fiscalización.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Candidaturas Registradas</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {summaryStats.total}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">En control documental Tribunal</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Presentación Completa</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {summaryStats.completas}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Escaños + documentación Tribunal al 100%
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Pendientes de Fiscalización</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {summaryStats.pendientes}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Faltan escaños o recaudos documentales
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Con Cargos Unipersonales</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {summaryStats.conUnipersonal}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Exigen Foto Carnet 3x4 obligatoria
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar candidatura por título, lista, departamento o seccional..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
          >
            <option value="TODOS">Todos los Módulos</option>
            <option value="NACIONAL_PRESIDENCIA">Presidencia y Vice</option>
            <option value="NACIONAL_SENADORES">Senadores Nacionales</option>
            <option value="NACIONAL_DIPUTADOS">Diputados Nacionales</option>
            <option value="NACIONAL_GOBERNACION">Gobernador y Junta Dptal.</option>
            <option value="ANR_NACIONAL_REGIONAL">Candidaturas ANR</option>
            <option value="SECCIONAL_ANR">Seccionales ANR</option>
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'TODAS', label: 'Todas' },
                { id: 'PRESENTACION_COMPLETA', label: 'Presentación Completa' },
                { id: 'PENDIENTE', label: 'Pendientes' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                  statusFilter === f.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          No hay candidaturas que coincidan con los filtros seleccionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Candidature Master List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[760px] overflow-y-auto">
            {filtered.map((c) => {
              const isSelected = selected?.id === c.id;
              const ev = evaluateFiscalizacion(c, []);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer block ${
                    isSelected
                      ? 'bg-red-50/80 ring-1 ring-inset ring-red-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-xs font-bold leading-snug ${
                        isSelected ? 'text-[#B91C1C]' : 'text-slate-900'
                      }`}
                    >
                      {c.title}
                    </p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                        ev.presentacionCompleta
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {ev.presentacionCompleta ? 'Completa' : 'Pendiente'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 tabular-nums">
                    <span>
                      Lista {c.listNumber} · v{c.versionNumber}
                    </span>
                    <span className="font-mono text-slate-600">
                      Esc. {c.totalCandidates}/{c.requiredCandidates} · Docs {ev.fulfilledCount}/
                      {ev.requiredCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Fiscalización Checklist & Document Upload */}
          {selected && evaluation && (
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-[#B91C1C]">
                      Lista {selected.listNumber} · v{selected.versionNumber}
                    </span>
                    <span>·</span>
                    <span>
                      {selected.departamento || 'Nacional'}
                      {selected.seccional ? ` · ${selected.seccional}` : ''}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5">{selected.title}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReceiptOpen(true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                      evaluation.presentacionCompleta
                        ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    Recibo de Fiscalización
                  </button>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('reportes')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver en Reportes
                    </button>
                  )}
                </div>
              </div>

              {/* Overall Presentation Readiness Banner */}
              <div
                className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
                  evaluation.presentacionCompleta
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-red-50 border-red-200 text-red-950'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {evaluation.presentacionCompleta ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-sm">
                      {evaluation.presentacionCompleta
                        ? 'Presentación Completa para el Tribunal Electoral'
                        : evaluation.allDocsFulfilled && !selected.isComplete
                          ? 'Documentación Tribunal completa — Escaños pendientes'
                          : 'Presentación Incompleta — Requisitos documentales pendientes'}
                    </p>
                    <p>
                      {evaluation.presentacionCompleta
                        ? 'Esta candidatura cumple el 100% de escaños y todos los documentos obligatorios exigidos para su presentación al Tribunal.'
                        : !selected.isComplete
                          ? `La lista tiene ${selected.totalCandidates}/${selected.requiredCandidates} escaños cargados y ${evaluation.fulfilledCount}/${evaluation.requiredCount} documentos obligatorios verificados.`
                          : `Faltan verificar o adjuntar ${
                              evaluation.requiredCount - evaluation.fulfilledCount
                            } documento(s) obligatorio(s) (${evaluation.fulfilledCount}/${evaluation.requiredCount} cumplidos).`}
                    </p>
                  </div>
                </div>
                <span className="font-mono font-bold text-sm tabular-nums px-3 py-1 rounded-lg bg-white/80 border border-current/20">
                  {evaluation.fulfilledCount} / {evaluation.requiredCount} req.
                </span>
              </div>

              {/* 5 Mandatory Tribunal Requirements */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Documentación Obligatoria para Presentación al Tribunal
                  </h3>
                  {loadingDocs && (
                    <span className="text-xs text-slate-500">Cargando adjuntos...</span>
                  )}
                </div>

                {evaluation.items.map((item, idx) => (
                  <div
                    key={item.key}
                    className={`border rounded-xl p-4 space-y-3 transition-colors ${
                      !item.required
                        ? 'border-slate-200 bg-slate-50/70 opacity-80'
                        : item.fulfilled
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-[240px]">
                        <input
                          type="checkbox"
                          disabled={!canFiscalizar || !item.required}
                          checked={item.checked}
                          onChange={() => handleToggleItem(item.key)}
                          className="mt-1 h-4 w-4 accent-[#B91C1C] rounded border-slate-300 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {idx + 1}. {item.label}
                            </span>
                            {item.required ? (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  item.fulfilled
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                {item.fulfilled ? 'Cumplido' : 'Obligatorio Pendiente'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                                No aplica (sin cargos unipersonales)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{item.description}</p>
                        </div>
                      </label>

                      {canAttachDocs && item.required && (
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingKey === item.key ? 'Subiendo...' : 'Adjuntar Archivo'}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            disabled={uploadingKey === item.key}
                            onChange={(e) => void handleUploadRequirementFile(item.key, item.docType, e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {item.attachedDocs.length > 0 && (
                      <div className="pl-7 space-y-1.5">
                        {item.attachedDocs.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">{d.fileName}</p>
                              <p className="text-[11px] text-slate-500">
                                {(d.sizeBytes / 1024).toFixed(1)} KB · Subido por {d.uploadedByName}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={d.dataUrl}
                                download={d.fileName}
                                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
                              >
                                <Download className="w-3 h-3" />
                                Descargar
                              </a>
                              {canDeleteDocs && (
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveDoc(d.id)}
                                  className="p-1 text-slate-500 hover:text-red-700 cursor-pointer"
                                  title="Eliminar archivo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Fiscalización Observations & Save */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-red-700 mb-1.5">
                    Observaciones de Fiscalización Documental
                  </label>
                  <textarea
                    rows={2}
                    disabled={!canFiscalizar}
                    value={checklist.observaciones || ''}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, observaciones: e.target.value }))
                    }
                    placeholder="Detalle de folios, recibo de pago de aporte, certificación notarial o faltantes..."
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-xs disabled:bg-slate-50 ${
                      (checklist.observaciones || '').trim()
                        ? 'border-red-300 text-red-700 font-medium'
                        : 'border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                {checklist.fiscalizadoPorName && (
                  <p className="text-[11px] text-slate-500">
                    Última fiscalización registrada por{' '}
                    <span className="font-semibold text-slate-700">
                      {checklist.fiscalizadoPorName}
                    </span>
                    {checklist.updatedAtIso
                      ? ` · ${new Date(checklist.updatedAtIso).toLocaleString('es-PY')}`
                      : ''}
                  </p>
                )}

                {saveMessage && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{saveMessage}</span>
                  </div>
                )}

                {errorMessage && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={!canFiscalizar || saving}
                    onClick={() => void handleSaveFiscalizacion()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B91C1C] text-white text-xs font-bold rounded-lg hover:bg-[#991B1B] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Guardando Fiscalización...' : 'Guardar Fiscalización Tribunal'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {receiptOpen && selected && (
        <FiscalizacionReceiptModal
          candidature={selected}
          docs={docs}
          checklist={checklist}
          onClose={() => setReceiptOpen(false)}
        />
      )}
    </div>
  );
};
