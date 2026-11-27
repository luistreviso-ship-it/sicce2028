import React, { useEffect, useMemo, useState } from 'react';
import {
  DEPARTAMENTOS_CON_CAPITAL,
  DEPARTAMENTOS_SIN_CAPITAL,
} from '../../data/paraguayElectoralData';
import {
  hasAltaPermission,
  hasModificacionPermission,
  saveCandidature,
} from '../../services/firestoreService';
import {
  Candidature,
  CandidatureModuleType,
  CandidatureSublist,
  DEFAULT_MOVEMENT_NAME,
  PadronRecord,
  SeatParameters,
  UserProfile,
} from '../../types/electoral';
import { validateGroupedCandidature } from '../../utils/validation';
import { CandidaturePreviewModal } from '../CandidaturePreviewModal';
import { CandidatureReceiptModal } from '../CandidatureReceiptModal';
import { CandidatureSummaryBar } from '../CandidatureSummaryBar';
import { PlurinominalListBuilder } from '../PlurinominalListBuilder';

type NationalTab = 'presidencia' | 'senadores' | 'diputados' | 'gobernacion';

interface NationalModuleProps {
  seatParams: SeatParameters;
  padronCatalog: PadronRecord[];
  padronMap: Map<string, PadronRecord>;
  currentUser: UserProfile;
  staffUids: string[];
  editingCandidature: Candidature | null;
  onClearEditing: () => void;
  onSaved: (saved: Candidature) => void;
}

export const NationalModule: React.FC<NationalModuleProps> = ({
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

  const [activeTab, setActiveTab] = useState<NationalTab>('presidencia');
  const [selectedDipDepto, setSelectedDipDepto] = useState<string>('Capital');
  const [selectedGobDepto, setSelectedGobDepto] = useState<string>('Concepción');

  const [movementName, setMovementName] = useState(DEFAULT_MOVEMENT_NAME);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [listNumber, setListNumber] = useState('A');
  const [changeNote, setChangeNote] = useState('Carga oficial Elecciones 2027');
  const [observationNote, setObservationNote] = useState('');
  const [sublists, setSublists] = useState<CandidatureSublist[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState<Candidature | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    setSaveSuccess(null);
    setSaveError(null);
    setSavedReceipt(null);
    if (editingCandidature) {
      if (editingCandidature.moduleType === 'NACIONAL_PRESIDENCIA') {
        setActiveTab('presidencia');
      } else if (editingCandidature.moduleType === 'NACIONAL_SENADORES') {
        setActiveTab('senadores');
      } else if (editingCandidature.moduleType === 'NACIONAL_DIPUTADOS') {
        setActiveTab('diputados');
        if (editingCandidature.departamento) setSelectedDipDepto(editingCandidature.departamento);
      } else if (editingCandidature.moduleType === 'NACIONAL_GOBERNACION') {
        setActiveTab('gobernacion');
        if (editingCandidature.departamento) setSelectedGobDepto(editingCandidature.departamento);
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

    if (activeTab === 'presidencia') {
      setSublists([
        {
          key: 'presidente',
          label: 'Presidente de la República',
          cargo: 'Presidente de la República',
          tipo: 'UNIPERSONAL',
          titularidad: 'UNICO',
          requiredSeats: 1,
          candidates: [],
        },
        {
          key: 'vicepresidente',
          label: 'Vicepresidente de la República',
          cargo: 'Vicepresidente de la República',
          tipo: 'UNIPERSONAL',
          titularidad: 'UNICO',
          requiredSeats: 1,
          candidates: [],
        },
      ]);
    } else if (activeTab === 'senadores') {
      setSublists([
        {
          key: 'senadores_titulares',
          label: 'Senador Nacional Titular',
          cargo: 'Senador Nacional Titular',
          tipo: 'PLURINOMINAL',
          titularidad: 'TITULAR',
          requiredSeats: seatParams.senadoresTitulares,
          candidates: [],
        },
        {
          key: 'senadores_suplentes',
          label: 'Senador Nacional Suplente',
          cargo: 'Senador Nacional Suplente',
          tipo: 'PLURINOMINAL',
          titularidad: 'SUPLENTE',
          requiredSeats: seatParams.senadoresSuplentes,
          candidates: [],
        },
      ]);
    } else if (activeTab === 'diputados') {
      const pair = seatParams.diputadosByDept[selectedDipDepto] || { titulares: 2, suplentes: 2 };
      setSublists([
        {
          key: `diputados_titulares_${selectedDipDepto}`,
          label: `Diputado Nacional Titular — ${selectedDipDepto}`,
          cargo: 'Diputado Nacional Titular',
          tipo: 'PLURINOMINAL',
          titularidad: 'TITULAR',
          departamento: selectedDipDepto,
          requiredSeats: pair.titulares,
          candidates: [],
        },
        {
          key: `diputados_suplentes_${selectedDipDepto}`,
          label: `Diputado Nacional Suplente — ${selectedDipDepto}`,
          cargo: 'Diputado Nacional Suplente',
          tipo: 'PLURINOMINAL',
          titularidad: 'SUPLENTE',
          departamento: selectedDipDepto,
          requiredSeats: pair.suplentes,
          candidates: [],
        },
      ]);
    } else if (activeTab === 'gobernacion') {
      const pair = seatParams.juntaDeptByDept[selectedGobDepto] || { titulares: 12, suplentes: 12 };
      setSublists([
        {
          key: `gobernador_${selectedGobDepto}`,
          label: `Gobernador — ${selectedGobDepto}`,
          cargo: 'Gobernador Departamental',
          tipo: 'UNIPERSONAL',
          titularidad: 'UNICO',
          departamento: selectedGobDepto,
          requiredSeats: 1,
          candidates: [],
        },
        {
          key: `junta_dept_titular_${selectedGobDepto}`,
          label: `Miembro Junta Departamental Titular — ${selectedGobDepto}`,
          cargo: 'Miembro Junta Departamental Titular',
          tipo: 'PLURINOMINAL',
          titularidad: 'TITULAR',
          departamento: selectedGobDepto,
          requiredSeats: pair.titulares,
          candidates: [],
        },
        {
          key: `junta_dept_suplente_${selectedGobDepto}`,
          label: `Miembro Junta Departamental Suplente — ${selectedGobDepto}`,
          cargo: 'Miembro Junta Departamental Suplente',
          tipo: 'PLURINOMINAL',
          titularidad: 'SUPLENTE',
          departamento: selectedGobDepto,
          requiredSeats: pair.suplentes,
          candidates: [],
        },
      ]);
    }
  }, [activeTab, selectedDipDepto, selectedGobDepto, seatParams, editingCandidature]);

  const moduleMeta = useMemo<{
    moduleType: CandidatureModuleType;
    title: string;
    departamento: string;
  }>(() => {
    if (activeTab === 'presidencia') {
      return {
        moduleType: 'NACIONAL_PRESIDENCIA',
        title: `Chapa Presidencial ANR 2027 — Lista ${listNumber}`,
        departamento: 'Nacional',
      };
    }
    if (activeTab === 'senadores') {
      return {
        moduleType: 'NACIONAL_SENADORES',
        title: `Senadores Nacionales (${seatParams.senadoresTitulares}T / ${seatParams.senadoresSuplentes}S) — Lista ${listNumber}`,
        departamento: 'Nacional',
      };
    }
    if (activeTab === 'diputados') {
      return {
        moduleType: 'NACIONAL_DIPUTADOS',
        title: `Diputados Nacionales · ${selectedDipDepto} — Lista ${listNumber}`,
        departamento: selectedDipDepto,
      };
    }
    return {
      moduleType: 'NACIONAL_GOBERNACION',
      title: `Gobernador y Junta Departamental · ${selectedGobDepto} — Lista ${listNumber}`,
      departamento: selectedGobDepto,
    };
  }, [activeTab, listNumber, selectedDipDepto, selectedGobDepto, seatParams]);

  const effectiveTitle = customTitle !== null ? customTitle : moduleMeta.title;

  const validation = useMemo(
    () =>
      validateGroupedCandidature(sublists, padronMap, {
        listNumber,
        title: effectiveTitle,
        moduleType: moduleMeta.moduleType,
        departamento: moduleMeta.departamento,
      }),
    [sublists, padronMap, listNumber, effectiveTitle, moduleMeta.moduleType, moduleMeta.departamento]
  );

  const handleSublistChange = (index: number, updated: CandidatureSublist) => {
    setSublists((prev) => prev.map((s, idx) => (idx === index ? updated : s)));
  };

  const handleSave = async () => {
    if (!validation.canSave || readOnly) return;
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);
    try {
      const saved = await saveCandidature({
        existingCandidature: editingCandidature,
        moduleType: moduleMeta.moduleType,
        title: effectiveTitle || moduleMeta.title,
        movementName,
        listNumber,
        departamento: moduleMeta.departamento,
        seccional: '',
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
          : `Candidatura "${saved.title}" guardada correctamente (Versión v${saved.versionNumber}).`
      );
      if (editingCandidature) onClearEditing();
      onSaved(saved);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la candidatura en la base electoral.'
      );
    } finally {
      setSaving(false);
    }
  };

  const draftPreviewCandidature: Candidature = {
    id: editingCandidature?.id || 'borrador_preview',
    moduleType: moduleMeta.moduleType,
    title: effectiveTitle || moduleMeta.title,
    movementName: movementName || DEFAULT_MOVEMENT_NAME,
    listNumber,
    departamento: moduleMeta.departamento,
    seccional: '',
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

  const getExcludedCedulas = (currentIdx: number): Set<string> => {
    const set = new Set<string>();
    sublists.forEach((s, idx) => {
      if (idx !== currentIdx) {
        s.candidates.forEach((c) => set.add(c.numero_ced));
      }
    });
    return set;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'presidencia', label: 'Presidente y Vicepresidente' },
              { id: 'senadores', label: 'Senadores Nacionales' },
              { id: 'diputados', label: 'Diputados por Departamento' },
              { id: 'gobernacion', label: 'Gobernador y Junta Dptal.' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={Boolean(editingCandidature)}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              } disabled:opacity-60`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'diputados' && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Departamento / Capital:
            </label>
            <select
              disabled={Boolean(editingCandidature)}
              value={selectedDipDepto}
              onChange={(e) => setSelectedDipDepto(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {DEPARTAMENTOS_CON_CAPITAL.map((d) => {
                const p = seatParams.diputadosByDept[d];
                return (
                  <option key={d} value={d}>
                    {d} ({p?.titulares ?? 2}T / {p?.suplentes ?? 2}S)
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {activeTab === 'gobernacion' && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Departamento (Agrupado):
            </label>
            <select
              disabled={Boolean(editingCandidature)}
              value={selectedGobDepto}
              onChange={(e) => setSelectedGobDepto(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
            >
              {DEPARTAMENTOS_SIN_CAPITAL.map((d) => {
                const p = seatParams.juntaDeptByDept[d];
                return (
                  <option key={d} value={d}>
                    {d} (1 Gob. + {p?.titulares ?? 12}T / {p?.suplentes ?? 12}S)
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {sublists.map((sub, idx) => (
          <PlurinominalListBuilder
            key={sub.key}
            sublist={sub}
            padronCatalog={padronCatalog}
            padronMap={padronMap}
            moduleType={moduleMeta.moduleType}
            departamento={moduleMeta.departamento}
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
