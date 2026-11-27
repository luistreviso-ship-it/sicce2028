import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Paperclip,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Pencil,
  Upload,
  Download,
  Eye,
  FileCheck2,
  ClipboardCheck,
  Search,
  Users,
  ShieldCheck,
} from 'lucide-react';
import {
  deleteCandidature,
  evaluateFiscalizacion,
  fetchCandidatureDocuments,
  hasAltaPermission,
  hasBajaPermission,
  hasModificacionPermission,
  removeCandidatureDocument,
  reviewCandidature,
  uploadCandidatureDocument,
} from '../../services/firestoreService';
import {
  AppRoute,
  Candidature,
  CandidatureDocument,
  DEFAULT_MOVEMENT_NAME,
  DocumentType,
  ReviewStatus,
  UserProfile,
} from '../../types/electoral';
import {
  exportCandidatureToExcel,
  exportCandidatureToPdf,
  exportConsolidatedCandidaturesToExcel,
} from '../../utils/exportReports';
import { buildOrderedSublistSlots } from '../../utils/validation';
import { CandidaturePreviewModal } from '../CandidaturePreviewModal';
import { CandidatureReceiptModal } from '../CandidatureReceiptModal';
import { FiscalizacionReceiptModal } from '../FiscalizacionReceiptModal';

interface ReportsAndDocsViewProps {
  candidatures: Candidature[];
  currentUser: UserProfile;
  staffUids: string[];
  onEditCandidature: (c: Candidature) => void;
  onRefresh: () => void;
  onNavigate?: (route: AppRoute) => void;
}

type DetailTab = 'nomina' | 'revision' | 'documentacion';

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  PAGO_APORTE_PARTIDARIO: 'Pago de Aporte Partidario',
  CEDULA_IDENTIDAD: 'Fotocopia de Cédula de Identidad',
  FOTO_CARNET_3X4: 'Foto tipo carnet 3x4 (Unipersonales)',
  ACEPTACION_TRIPLICADO: 'Aceptaciones de Candidaturas en Triplicado',
  AUTENTICACION_ACEPTACION: 'Autenticación / Certificación de Aceptaciones',
  CARTA_RESPALDO: 'Carta de Respaldo / Consentimiento',
  CERTIFICADO_AFILIACION: 'Certificado de Afiliación ANR',
  ACTA_COMPROMISO: 'Acta de Compromiso Electoral',
  OTRO: 'Otro Documento Respaldatorio',
};

export const ReportsAndDocsView: React.FC<ReportsAndDocsViewProps> = ({
  candidatures,
  currentUser,
  staffUids,
  onEditCandidature,
  onRefresh,
  onNavigate,
}) => {
  const [statusFilter, setStatusFilter] = useState<'TODAS' | ReviewStatus>('TODAS');
  const [completenessFilter, setCompletenessFilter] = useState<
    'TODAS' | 'COMPLETAS' | 'INCOMPLETAS'
  >('TODAS');
  const [moduleFilter, setModuleFilter] = useState<string>('TODOS');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(candidatures[0]?.id || '');
  const [detailTab, setDetailTab] = useState<DetailTab>('nomina');
  const [sublistFilterKey, setSublistFilterKey] = useState<string>('TODAS');

  const [docs, setDocs] = useState<CandidatureDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('PAGO_APORTE_PARTIDARIO');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [fiscalizacionReceiptOpen, setFiscalizacionReceiptOpen] = useState(false);

  const summaryKpis = useMemo(() => {
    const total = candidatures.length;
    const completas = candidatures.filter((c) => c.isComplete).length;
    const observadas = candidatures.filter((c) => c.reviewStatus === 'OBSERVADA').length;
    const tribunalCompletas = candidatures.filter(
      (c) => evaluateFiscalizacion(c, []).presentacionCompleta
    ).length;
    return { total, completas, observadas, tribunalCompletas };
  }, [candidatures]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidatures.filter((c) => {
      if (statusFilter !== 'TODAS' && c.reviewStatus !== statusFilter) return false;
      if (completenessFilter === 'COMPLETAS' && !c.isComplete) return false;
      if (completenessFilter === 'INCOMPLETAS' && c.isComplete) return false;
      if (moduleFilter !== 'TODOS' && c.moduleType !== moduleFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.movementName || '').toLowerCase().includes(q) ||
        c.listNumber.toLowerCase().includes(q) ||
        c.departamento.toLowerCase().includes(q) ||
        c.seccional.toLowerCase().includes(q)
      );
    });
  }, [candidatures, statusFilter, completenessFilter, moduleFilter, search]);

  const selected = useMemo(
    () => filtered.find((c) => c.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  useEffect(() => {
    setSublistFilterKey('TODAS');
    if (!selected) {
      setDocs([]);
      return;
    }
    setReviewComment(selected.reviewComment || '');
    setReviewError(null);
    setConfirmDeleteId(null);
    setLoadingDocs(true);
    const isBootAdmin = currentUser.email.toLowerCase() === 'fcinmobiliariapy@gmail.com';
    fetchCandidatureDocuments(selected.id, currentUser.uid, isBootAdmin)
      .then(setDocs)
      .finally(() => setLoadingDocs(false));
  }, [selected, currentUser]);

  const fiscalizacionEval = useMemo(
    () => (selected ? evaluateFiscalizacion(selected, docs) : null),
    [selected, docs]
  );

  const canReview =
    currentUser.role === 'admin' ||
    (currentUser.role === 'revisor' && hasModificacionPermission(currentUser));
  const canAttach =
    Boolean(selected) &&
    (hasAltaPermission(currentUser) || hasModificacionPermission(currentUser)) &&
    (currentUser.role === 'admin' ||
      currentUser.role === 'revisor' ||
      selected?.createdByUid === currentUser.uid);

  const canDeleteDocs =
    Boolean(selected) &&
    (hasBajaPermission(currentUser) ||
      (currentUser.role === 'operador' &&
        hasModificacionPermission(currentUser) &&
        selected!.createdByUid === currentUser.uid &&
        selected!.reviewStatus !== 'APROBADA'));

  const canEdit =
    Boolean(selected) &&
    hasModificacionPermission(currentUser) &&
    (currentUser.role === 'admin' ||
      (currentUser.role === 'operador' &&
        selected!.createdByUid === currentUser.uid &&
        selected!.reviewStatus !== 'APROBADA'));

  const canDelete = Boolean(selected) && hasBajaPermission(currentUser);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected || !canAttach) return;
    setDocError(null);
    if (file.size > 450 * 1024) {
      setDocError('El archivo supera el límite de 450 KB para almacenamiento documental seguro.');
      e.target.value = '';
      return;
    }

    setUploadingDoc(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
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
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Error al subir documento.');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!selected || !canDeleteDocs) return;
    await removeCandidatureDocument(selected.id, docId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleReviewAction = async (status: ReviewStatus) => {
    if (!selected || !canReview) return;
    setReviewError(null);
    setReviewing(true);
    try {
      await reviewCandidature(selected, status, reviewComment, currentUser, staffUids);
      onRefresh();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'No se pudo actualizar la revisión.');
    } finally {
      setReviewing(false);
    }
  };

  const handleDeleteCandidature = async () => {
    if (!selected || !canDelete) return;
    await deleteCandidature(selected, currentUser, staffUids);
    setConfirmDeleteId(null);
    onRefresh();
  };

  const visibleSublists = useMemo(() => {
    if (!selected) return [];
    if (sublistFilterKey === 'TODAS') return selected.sublists;
    return selected.sublists.filter((s) => s.key === sublistFilterKey);
  }, [selected, sublistFilterKey]);

  return (
    <div className="space-y-5">
      {/* Compact 4-KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Total Informes</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            {summaryKpis.total}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Escaños Completos</p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
            {summaryKpis.completas}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">En Observación</p>
          <p className="text-xl font-bold font-mono tabular-nums text-red-700 mt-0.5">
            {summaryKpis.observadas}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Completas Tribunal</p>
          <p className="text-xl font-bold font-mono tabular-nums text-[#B91C1C] mt-0.5">
            {summaryKpis.tribunalCompletas}
          </p>
        </div>
      </div>

      {/* Filter & Consolidated Export Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar informes por título, lista, departamento o seccional..."
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

          <select
            value={completenessFilter}
            onChange={(e) =>
              setCompletenessFilter(e.target.value as 'TODAS' | 'COMPLETAS' | 'INCOMPLETAS')
            }
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
          >
            <option value="TODAS">Escaños: Todos</option>
            <option value="COMPLETAS">Solo Completas</option>
            <option value="INCOMPLETAS">Solo Incompletas</option>
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['TODAS', 'PENDIENTE', 'APROBADA', 'OBSERVADA'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={() => exportConsolidatedCandidaturesToExcel(filtered)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            Consolidado Excel
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          No hay candidaturas confirmadas que coincidan con el filtro seleccionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Master List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[800px] overflow-y-auto">
            {filtered.map((c) => {
              const isSelected = selected?.id === c.id;
              const fiscEv = evaluateFiscalizacion(c, []);
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
                        c.reviewStatus === 'APROBADA'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.reviewStatus === 'OBSERVADA'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {c.reviewStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mt-1.5 tabular-nums">
                    <span>
                      Lista {c.listNumber} · v{c.versionNumber} · {c.totalCandidates}/
                      {c.requiredCandidates} esc.
                      {!c.isComplete && (
                        <span className="text-red-700 font-semibold ml-1">(Incompleta)</span>
                      )}
                    </span>
                    <span
                      className={
                        fiscEv.presentacionCompleta
                          ? 'text-emerald-700 font-bold'
                          : 'text-slate-500'
                      }
                    >
                      Tribunal: {fiscEv.fulfilledCount}/{fiscEv.requiredCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Tabbed Detail, Export, Review & Documents */}
          {selected && fiscalizacionEval && (
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              {/* Header & Action Bar */}
              <div className="space-y-3 pb-4 border-b border-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#B91C1C]">
                      Lista {selected.listNumber} · v{selected.versionNumber} ·{' '}
                      {selected.departamento || 'Nacional'}
                      {selected.seccional ? ` · ${selected.seccional}` : ''}
                    </p>
                    <h3 className="text-lg font-bold text-slate-900 mt-0.5">{selected.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selected.movementName || DEFAULT_MOVEMENT_NAME} · Cargado por{' '}
                      {selected.createdByName}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0 ${
                      fiscalizacionEval.presentacionCompleta
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {fiscalizacionEval.presentacionCompleta
                      ? 'Presentación Completa Tribunal'
                      : `Tribunal ${fiscalizacionEval.fulfilledCount}/${fiscalizacionEval.requiredCount}`}
                  </span>
                </div>

                {/* Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  {selected.isComplete && (
                    <button
                      type="button"
                      onClick={() => setReceiptModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      Recibo Candidatura
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiscalizacionReceiptOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 text-[#B91C1C]" />
                    Recibo Fiscalización
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#B91C1C]" />
                    Vista Previa / Editar Exportación
                  </button>
                  <button
                    type="button"
                    onClick={() => exportCandidatureToPdf(selected)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Exportar PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => exportCandidatureToExcel(selected)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Exportar Excel
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onEditCandidature(selected)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar Lista
                    </button>
                  )}
                  {canDelete &&
                    (confirmDeleteId === selected.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteCandidature()}
                          className="px-3 py-1.5 bg-red-700 text-white text-xs font-semibold rounded-lg hover:bg-red-800 cursor-pointer whitespace-nowrap"
                        >
                          Confirmar Baja
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 border border-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(selected.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Dar de Baja
                      </button>
                    ))}
                </div>
              </div>

              {/* Organized Detail Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setDetailTab('nomina')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                    detailTab === 'nomina'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Nómina ({selected.totalCandidates}/{selected.requiredCandidates})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('revision')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                    detailTab === 'revision'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Dictamen y Revisión
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('documentacion')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                    detailTab === 'documentacion'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Documentación ({docs.length})
                </button>
              </div>

              {/* Tab 1: Nómina de Candidatos (Ascending Order + Sin Registro + 5 Exact Columns) */}
              {detailTab === 'nomina' && (
                <div className="space-y-4">
                  {selected.sublists.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSublistFilterKey('TODAS')}
                        className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                          sublistFilterKey === 'TODAS'
                            ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Todas ({selected.sublists.length})
                      </button>
                      {selected.sublists.map((sub) => (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => setSublistFilterKey(sub.key)}
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer truncate max-w-[220px] ${
                            sublistFilterKey === sub.key
                              ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {sub.label} ({sub.candidates.length}/{sub.requiredSeats})
                        </button>
                      ))}
                    </div>
                  )}

                  {visibleSublists.map((sub) => {
                    const orderedSlots = buildOrderedSublistSlots(sub, {
                      moduleType: selected.moduleType,
                      departamento: selected.departamento,
                      seccional: selected.seccional,
                    });
                    return (
                      <div key={sub.key} className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                          <span>{sub.label}</span>
                          <span className="font-mono tabular-nums">
                            {sub.candidates.length}/{sub.requiredSeats}
                          </span>
                        </div>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
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
                              {orderedSlots.map((slot) => {
                                const hasObs =
                                  !slot.isEmpty &&
                                  slot.observacion !== 'Sin observación';
                                return (
                                  <tr
                                    key={`${sub.key}-${slot.orden}`}
                                    className={
                                      slot.isEmpty
                                        ? 'bg-slate-50/50 text-slate-500'
                                        : hasObs
                                          ? 'bg-red-50/40'
                                          : ''
                                    }
                                  >
                                    <td className="py-1.5 px-2.5 font-mono font-bold tabular-nums">
                                      #{slot.orden}
                                    </td>
                                    <td
                                      className={`py-1.5 px-2.5 ${
                                        slot.isEmpty
                                          ? 'italic text-slate-500'
                                          : 'font-medium text-slate-900'
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
                                        hasObs ? 'text-red-700 font-semibold' : 'text-slate-700'
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
              )}

              {/* Tab 2: Dictamen y Revisión Electoral */}
              {detailTab === 'revision' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Dictamen de Revisión Electoral
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        selected.reviewStatus === 'APROBADA'
                          ? 'text-emerald-700'
                          : selected.reviewStatus === 'OBSERVADA'
                            ? 'text-red-700'
                            : 'text-slate-700'
                      }`}
                    >
                      {selected.reviewStatus === 'APROBADA' && (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      {selected.reviewStatus === 'OBSERVADA' && (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                      {selected.reviewStatus === 'PENDIENTE' && <Clock className="w-4 h-4" />}
                      {selected.reviewStatus}
                      {!selected.isComplete && ' (Incompleta)'}
                    </span>
                  </div>

                  {canReview &&
                  (selected.reviewStatus !== 'APROBADA' || currentUser.role === 'admin') ? (
                    <>
                      <textarea
                        rows={3}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Observaciones del Tribunal / Revisor..."
                        className={`w-full px-3 py-2 bg-white border rounded-lg text-xs ${
                          reviewComment.trim()
                            ? 'border-red-300 text-red-700 font-medium'
                            : 'border-slate-300 text-slate-900'
                        }`}
                      />
                      {reviewError && (
                        <p className="text-xs text-red-700 font-medium">{reviewError}</p>
                      )}
                      {!selected.isComplete && (
                        <p className="text-[11px] text-red-700 font-medium">
                          Lista incompleta ({selected.totalCandidates}/{selected.requiredCandidates}{' '}
                          escaños): solo puede permanecer en estado OBSERVADA hasta completar los
                          escaños.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={reviewing || !selected.isComplete}
                          onClick={() => void handleReviewAction('APROBADA')}
                          className="px-3.5 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                        >
                          Aprobar Lista Oficial
                        </button>
                        <button
                          type="button"
                          disabled={reviewing}
                          onClick={() => void handleReviewAction('OBSERVADA')}
                          className="px-3.5 py-1.5 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer whitespace-nowrap"
                        >
                          Guardar Observaciones
                        </button>
                      </div>
                    </>
                  ) : (
                    <p
                      className={`text-xs ${
                        selected.reviewComment
                          ? 'text-red-700 font-semibold'
                          : 'text-slate-700'
                      }`}
                    >
                      Observación registrada: {selected.reviewComment || 'Sin observaciones.'}
                    </p>
                  )}
                </div>
              )}

              {/* Tab 3: Documentación Respaldatoria & Fiscalización Tribunal */}
              {detailTab === 'documentacion' && (
                <div className="space-y-4">
                  <div
                    className={`rounded-lg border p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
                      fiscalizacionEval.presentacionCompleta
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    <div>
                      <p className="font-bold">
                        Estado de Fiscalización Tribunal:{' '}
                        {fiscalizacionEval.presentacionCompleta
                          ? 'Presentación Completa'
                          : 'Pendiente'}
                      </p>
                      <p className="text-[11px] mt-0.5">
                        {fiscalizacionEval.fulfilledCount}/{fiscalizacionEval.requiredCount}{' '}
                        requisitos documentales verificados ·{' '}
                        {fiscalizacionEval.hasUnipersonal
                          ? 'Incluye candidatura unipersonal (requiere Foto 3x4).'
                          : 'Lista plurinominal.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFiscalizacionReceiptOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        Recibo Fiscalización
                      </button>
                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate('fiscalizacion')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-current/25 rounded-lg font-semibold hover:bg-white/80 cursor-pointer whitespace-nowrap"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Ir a Fiscalización
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-[#B91C1C]" />
                      Archivos Adjuntos ({docs.length})
                    </h4>

                    {canAttach && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={docType}
                          onChange={(e) => setDocType(e.target.value as DocumentType)}
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                        >
                          {Object.entries(DOC_TYPE_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingDoc ? 'Subiendo...' : 'Adjuntar Archivo'}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            disabled={uploadingDoc}
                            onChange={(e) => void handleFileUpload(e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {docError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                      {docError}
                    </div>
                  )}

                  {loadingDocs ? (
                    <p className="text-xs text-slate-500">Cargando documentos adjuntos...</p>
                  ) : docs.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Sin documentos adjuntos todavía. Adjunte comprobantes de aporte partidario,
                      copias de C.I., fotos 3x4, aceptaciones en triplicado o autenticaciones (PDF o
                      imagen hasta 450 KB).
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                      {docs.map((d) => (
                        <div
                          key={d.id}
                          className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{d.fileName}</p>
                            <p className="text-slate-500">
                              {DOC_TYPE_LABELS[d.docType]} · {(d.sizeBytes / 1024).toFixed(1)} KB ·
                              Subido por {d.uploadedByName}
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
              )}
            </div>
          )}
        </div>
      )}

      {previewModalOpen && selected && (
        <CandidaturePreviewModal
          candidature={selected}
          editable={true}
          onClose={() => setPreviewModalOpen(false)}
        />
      )}

      {receiptModalOpen && selected && selected.isComplete && (
        <CandidatureReceiptModal
          candidature={selected}
          onClose={() => setReceiptModalOpen(false)}
        />
      )}

      {fiscalizacionReceiptOpen && selected && (
        <FiscalizacionReceiptModal
          candidature={selected}
          docs={docs}
          onClose={() => setFiscalizacionReceiptOpen(false)}
        />
      )}
    </div>
  );
};
