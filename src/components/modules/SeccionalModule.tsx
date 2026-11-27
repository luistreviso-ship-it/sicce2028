import React, { useEffect, useMemo, useState } from 'react';
import { DEPARTAMENTOS_CON_CAPITAL } from '../../data/paraguayElectoralData';
import {
  hasAltaPermission,
  hasModificacionPermission,
  saveCandidature,
} from '../../services/firestoreService';
import {
  Candidature,
  CandidatureSublist,
  DEFAULT_MOVEMENT_NAME,
  PadronRecord,
  SeatParameters,
  SeccionalSeatConfig,
  UserProfile,
} from '../../types/electoral';
import { validateGroupedCandidature } from '../../utils/validation';
import { CandidaturePreviewModal } from '../CandidaturePreviewModal';
import { CandidatureReceiptModal } from '../CandidatureReceiptModal';
import { CandidatureSummaryBar } from '../CandidatureSummaryBar';
import { PlurinominalListBuilder } from '../PlurinominalListBuilder';

interface SeccionalModuleProps {
  seatParams: SeatParameters;
  padronCatalog: PadronRecord[];
  padronMap: Map<string, PadronRecord>;
  currentUser: UserProfile;
  staffUids: string[];
  editingCandidature: Candidature | null;
  onClearEditing: () => void;
  onSaved: (saved: Candidature) => void;
}

export const SeccionalModule: React.FC<SeccionalModuleProps> = ({
  seatParams,
  padronCatalog,
  padronMap,
  currentUser,
  staffUids,
  editingCandidature,
  onClearEditing,
  onSaved,
}) => {
  const canPerformAction = editingCandidature
    ? hasModificacionPermission(currentUser) &&
      (currentUser.role === 'admin' ||
        (currentUser.role === 'operador' &&
          editingCandidature.createdByUid === currentUser.uid &&
          editingCandidature.reviewStatus !== 'APROBADA'))
    : hasAltaPermission(currentUser);
  const readOnly = !canPerformAction;

  const allSeccionales = useMemo(
    () =>
      Object.values(seatParams.seccionalesConfig).sort((a, b) => {
        const deptCmp = a.departamento.localeCompare(b.departamento);
        if (deptCmp !== 0) return deptCmp;
        const distCmp = a.distrito.localeCompare(b.distrito);
        if (distCmp !== 0) return distCmp;
        return Number(a.nroSeccional || 0) - Number(b.nroSeccional || 0) || a.nombre.localeCompare(b.nombre);
      }),
    [seatParams.seccionalesConfig]
  );

  const [selectedDepto, setSelectedDepto] = useState<string>('Capital');
  const [selectedDistrito, setSelectedDistrito] = useState<string>('Asunción');
  const [selectedSeccionalId, setSelectedSeccionalId] = useState<string>(
    allSeccionales.find((s) => s.departamento === 'Capital')?.id || allSeccionales[0]?.id || 'SEC-00-001'
  );

  const [movementName, setMovementName] = useState(DEFAULT_MOVEMENT_NAME);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [listNumber, setListNumber] = useState('A');
  const [changeNote, setChangeNote] = useState('Presentación cuerpo único de Seccional ANR');
  const [observationNote, setObservationNote] = useState('');
  const [sublists, setSublists] = useState<CandidatureSublist[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState<Candidature | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const distritosInDepto = useMemo(() => {
    const set = new Set<string>();
    allSeccionales
      .filter((s) => s.departamento === selectedDepto)
      .forEach((s) => set.add(s.distrito));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSeccionales, selectedDepto]);

  const seccionalesInDistrito = useMemo(() => {
    return allSeccionales.filter(
      (s) => s.departamento === selectedDepto && s.distrito === selectedDistrito
    );
  }, [allSeccionales, selectedDepto, selectedDistrito]);

  // Keep cascade selections consistent when department changes
  const handleDeptoChange = (depto: string) => {
    setSelectedDepto(depto);
    const matching = allSeccionales.filter((s) => s.departamento === depto);
    if (matching.length > 0) {
      const nextDist = matching[0].distrito;
      setSelectedDistrito(nextDist);
      const firstSec = matching.find((s) => s.distrito === nextDist) || matching[0];
      setSelectedSeccionalId(firstSec.id);
    }
  };

  const handleDistritoChange = (distrito: string) => {
    setSelectedDistrito(distrito);
    const firstSec = allSeccionales.find(
      (s) => s.departamento === selectedDepto && s.distrito === distrito
    );
    if (firstSec) setSelectedSeccionalId(firstSec.id);
  };

  const activeSeccional: SeccionalSeatConfig = useMemo(() => {
    return (
      seatParams.seccionalesConfig[selectedSeccionalId] ||
      seccionalesInDistrito[0] ||
      allSeccionales[0] || {
        id: 'SEC-00-001',
        nroSeccional: '1',
        nombre: 'Jaime Peña',
        departamento: 'Capital',
        distrito: 'Asunción',
        miembrosTitulares: 12,
        miembrosSuplentes: 12,
        convencionalesTitulares: 6,
        convencionalesSuplentes: 6,
      }
    );
  }, [seatParams.seccionalesConfig, selectedSeccionalId, seccionalesInDistrito, allSeccionales]);

  useEffect(() => {
    setSaveSuccess(null);
    setSaveError(null);
    setSavedReceipt(null);
    if (editingCandidature && editingCandidature.moduleType === 'SECCIONAL_ANR') {
      const matchedSec = allSeccionales.find(
        (s) =>
          editingCandidature.seccional.includes(s.nombre) ||
          s.nombre === editingCandidature.seccional
      );
      if (matchedSec) {
        setSelectedDepto(matchedSec.departamento);
        setSelectedDistrito(matchedSec.distrito);
        setSelectedSeccionalId(matchedSec.id);
      }
      setMovementName(editingCandidature.movementName || DEFAULT_MOVEMENT_NAME);
      setCustomTitle(editingCandidature.title);
      setListNumber(
        ['A', 'B', 'C', 'D'].includes(editingCandidature.listNumber)
          ? editingCandidature.listNumber
          : 'A'
      );
      setChangeNote(`Actualización v${editingCandidature.versionNumber + 1}`);
      setObservationNote(editingCandidature.reviewComment || '');
      setSublists(editingCandidature.sublists);
      return;
    }

    setCustomTitle(null);
    setObservationNote('');

    const secLabel = activeSeccional.nroSeccional
      ? `Secc. ${activeSeccional.nroSeccional} - ${activeSeccional.nombre}`
      : activeSeccional.nombre;

    setSublists([
      {
        key: 'presidente_seccional',
        label: `1. Cabeza de Lista — Presidente de ${secLabel}`,
        cargo: 'Presidente de Seccional',
        tipo: 'UNIPERSONAL',
        titularidad: 'UNICO',
        departamento: activeSeccional.departamento,
        seccional: secLabel,
        requiredSeats: 1,
        candidates: [],
      },
      {
        key: 'miembros_titulares',
        label: '2. Miembros Titulares de Seccional',
        cargo: 'Miembro Titular de Seccional',
        tipo: 'PLURINOMINAL',
        titularidad: 'TITULAR',
        departamento: activeSeccional.departamento,
        seccional: secLabel,
        requiredSeats: activeSeccional.miembrosTitulares,
        candidates: [],
      },
      {
        key: 'miembros_suplentes',
        label: '3. Miembros Suplentes de Seccional',
        cargo: 'Miembro Suplente de Seccional',
        tipo: 'PLURINOMINAL',
        titularidad: 'SUPLENTE',
        departamento: activeSeccional.departamento,
        seccional: secLabel,
        requiredSeats: activeSeccional.miembrosSuplentes,
        candidates: [],
      },
      {
        key: 'convencional_titular',
        label: '4. Convencional Titular ANR',
        cargo: 'Convencional Titular',
        tipo: 'PLURINOMINAL',
        titularidad: 'TITULAR',
        departamento: activeSeccional.departamento,
        seccional: secLabel,
        requiredSeats: activeSeccional.convencionalesTitulares,
        candidates: [],
      },
      {
        key: 'convencional_suplente',
        label: '5. Convencional Suplente ANR',
        cargo: 'Convencional Suplente',
        tipo: 'PLURINOMINAL',
        titularidad: 'SUPLENTE',
        departamento: activeSeccional.departamento,
        seccional: secLabel,
        requiredSeats: activeSeccional.convencionalesSuplentes,
        candidates: [],
      },
    ]);
  }, [activeSeccional, editingCandidature, allSeccionales]);

  const secDisplayName = activeSeccional.nroSeccional
    ? `Secc. ${activeSeccional.nroSeccional} - ${activeSeccional.nombre}`
    : activeSeccional.nombre;
  const defaultTitle = `${secDisplayName} (${activeSeccional.distrito}, ${activeSeccional.departamento}) — Lista ${listNumber}`;
  const effectiveTitle = customTitle !== null ? customTitle : defaultTitle;

  const validation = useMemo(
    () =>
      validateGroupedCandidature(sublists, padronMap, {
        listNumber,
        title: effectiveTitle,
        moduleType: 'SECCIONAL_ANR',
        departamento: activeSeccional.departamento,
        seccional: secDisplayName,
      }),
    [sublists, padronMap, listNumber, effectiveTitle, activeSeccional.departamento, secDisplayName]
  );

  const handleSublistChange = (index: number, updated: CandidatureSublist) => {
    setSublists((prev) => prev.map((s, idx) => (idx === index ? updated : s)));
  };

  const getExcludedCedulas = (currentIdx: number): Set<string> => {
    const set = new Set<string>();
    sublists.forEach((s, idx) => {
      if (idx !== currentIdx) {
        s.candidates.forEach((c) => set.add(c.numero_ced));
      }
    });
    return set;
  };

  const handleSave = async () => {
    if (!validation.canSave || readOnly) return;
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);
    try {
      const saved = await saveCandidature({
        existingCandidature: editingCandidature,
        moduleType: 'SECCIONAL_ANR',
        title: effectiveTitle || defaultTitle,
        movementName,
        listNumber,
        departamento: activeSeccional.departamento,
        seccional: secDisplayName.slice(0, 80),
        sublists,
        changeNote,
        observationNote,
        actor: currentUser,
        staffUids,
      });
      const delivered: Candidature = {
        ...saved,
        createdAt: editingCandidature?.createdAt || new Date(),
        updatedAt: new Date(),
      };
      setSavedReceipt(delivered.isComplete ? delivered : null);
      setSaveSuccess(
        saved.reviewStatus === 'OBSERVADA'
          ? `Candidatura "${saved.title}" grabada en estado OBSERVADA (v${saved.versionNumber}) con ${saved.totalCandidates}/${saved.requiredCandidates} escaños: ${saved.reviewComment}`
          : `Cuerpo completo de "${saved.title}" registrado (v${saved.versionNumber}) con los ${saved.totalCandidates} escaños obligatorios.`
      );
      if (editingCandidature) onClearEditing();
      onSaved(saved);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la candidatura de Seccional en la base electoral.'
      );
    } finally {
      setSaving(false);
    }
  };

  const draftPreviewCandidature: Candidature = {
    id: editingCandidature?.id || 'borrador_sec_preview',
    moduleType: 'SECCIONAL_ANR',
    title: effectiveTitle || defaultTitle,
    movementName: movementName || DEFAULT_MOVEMENT_NAME,
    listNumber,
    departamento: activeSeccional.departamento,
    seccional: secDisplayName.slice(0, 80),
    sublists,
    totalCandidates: validation.totalLoaded,
    requiredCandidates: validation.totalRequired,
    isComplete: validation.isComplete,
    reviewStatus: validation.hasObservations ? 'OBSERVADA' : 'PENDIENTE',
    reviewComment: validation.hasObservations
      ? observationNote || validation.autoObservationText
      : observationNote,
    reviewedByUid: editingCandidature?.reviewedByUid || '',
    versionNumber: editingCandidature ? editingCandidature.versionNumber + 1 : 1,
    createdByUid: currentUser.uid,
    createdByName: currentUser.displayName,
    authorizedUids: [currentUser.uid],
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              1. Departamento / Capital
            </label>
            <select
              disabled={Boolean(editingCandidature)}
              value={selectedDepto}
              onChange={(e) => handleDeptoChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
            >
              {DEPARTAMENTOS_CON_CAPITAL.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              2. Distrito
            </label>
            <select
              disabled={Boolean(editingCandidature)}
              value={selectedDistrito}
              onChange={(e) => handleDistritoChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
            >
              {distritosInDepto.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              3. Seccional ANR (Cuerpo Único)
            </label>
            <select
              disabled={Boolean(editingCandidature)}
              value={activeSeccional.id}
              onChange={(e) => setSelectedSeccionalId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
            >
              {seccionalesInDistrito.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  N.º {sec.nroSeccional || sec.id} — {sec.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200 text-xs">
          <div className="text-slate-600">
            <span className="font-semibold text-slate-900">{secDisplayName}</span>
            {' · '}
            <span>{activeSeccional.distrito}</span>
            {' · '}
            <span>{activeSeccional.departamento}</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-slate-500">Presidente: </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">1</span>
            </div>
            <div>
              <span className="text-slate-500">Miembros Secc.: </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {activeSeccional.miembrosTitulares}T / {activeSeccional.miembrosSuplentes}S
              </span>
            </div>
            <div>
              <span className="text-slate-500">Convencionales: </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {activeSeccional.convencionalesTitulares}T / {activeSeccional.convencionalesSuplentes}S
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {sublists.map((sub, idx) => (
          <PlurinominalListBuilder
            key={sub.key}
            sublist={sub}
            padronCatalog={padronCatalog}
            padronMap={padronMap}
            moduleType="SECCIONAL_ANR"
            departamento={activeSeccional.departamento}
            seccional={secDisplayName}
            onChange={(updated) => handleSublistChange(idx, updated)}
            excludedCedulas={getExcludedCedulas(idx)}
            readOnly={readOnly}
          />
        ))}
      </div>

      <CandidatureSummaryBar
        title={effectiveTitle}
        onTitleChange={setCustomTitle}
        movementName={movementName}
        onMovementNameChange={setMovementName}
        listNumber={listNumber}
        onListNumberChange={setListNumber}
        changeNote={changeNote}
        onChangeNoteChange={setChangeNote}
        observationNote={observationNote}
        onObservationNoteChange={setObservationNote}
        isEditing={Boolean(editingCandidature)}
        validation={validation}
        saving={saving}
        readOnly={readOnly}
        readOnlyReason={
          editingCandidature
            ? 'No cuenta con permiso de Modificación o la lista ya fue aprobada.'
            : 'No cuenta con permiso de Alta para registrar nuevas candidaturas.'
        }
        onSave={() => void handleSave()}
        onOpenPreview={() => setPreviewOpen(true)}
        onCancelEdit={onClearEditing}
        saveSuccessMessage={saveSuccess}
        saveErrorMessage={saveError}
        savedReceiptCandidature={savedReceipt}
        onOpenReceipt={() => setReceiptOpen(true)}
      />

      {previewOpen && (
        <CandidaturePreviewModal
          candidature={draftPreviewCandidature}
          editable={!readOnly}
          onApplyDraftChanges={(updated) => {
            setCustomTitle(updated.title);
            setMovementName(updated.movementName);
            setListNumber(updated.listNumber);
            setObservationNote(updated.reviewComment);
            setSublists(updated.sublists);
          }}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {receiptOpen && savedReceipt && savedReceipt.isComplete && (
        <CandidatureReceiptModal
          candidature={savedReceipt}
          onClose={() => setReceiptOpen(false)}
        />
      )}
    </div>
  );
};
