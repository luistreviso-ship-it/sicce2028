import React, { useEffect, useMemo, useState } from 'react';
import { Users, CheckCircle2 } from 'lucide-react';
import { DEPARTAMENTOS_CON_CAPITAL } from '../../data/paraguayElectoralData';
import {
  hasAltaPermission,
  hasModificacionPermission,
  saveCandidature,
} from '../../services/firestoreService';
import {
  CandidateEntry,
  Candidature,
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

type AnrSectionTab = 'presidente_anr' | 'junta_nacional' | 'segmento_regional';

interface AnrModuleProps {
  seatParams: SeatParameters;
  padronCatalog: PadronRecord[];
  padronMap: Map<string, PadronRecord>;
  currentUser: UserProfile;
  staffUids: string[];
  editingCandidature: Candidature | null;
  onClearEditing: () => void;
  onSaved: (saved: Candidature) => void;
}

export const AnrModule: React.FC<AnrModuleProps> = ({
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

  const [sectionTab, setSectionTab] = useState<AnrSectionTab>('presidente_anr');
  const [selectedRegionalDept, setSelectedRegionalDept] = useState<string>('Capital');

  const [movementName, setMovementName] = useState(DEFAULT_MOVEMENT_NAME);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [listNumber, setListNumber] = useState('A');
  const [changeNote, setChangeNote] = useState('Paquete agrupado Autoridades ANR');
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
    if (editingCandidature && editingCandidature.moduleType === 'ANR_NACIONAL_REGIONAL') {
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

    const built: CandidatureSublist[] = [
      {
        key: 'presidente_anr',
        label: 'Presidente de la A.N.R.',
        cargo: 'Presidente de la Junta de Gobierno ANR',
        tipo: 'UNIPERSONAL',
        titularidad: 'UNICO',
        requiredSeats: 1,
        candidates: [],
      },
      {
        key: 'junta_nac_titular',
        label: 'Lista Nacional Junta de Gobierno — Titular',
        cargo: 'Miembro Junta de Gobierno Nacional Titular',
        tipo: 'PLURINOMINAL',
        titularidad: 'TITULAR',
        requiredSeats: seatParams.juntaGobNacionalTitulares,
        candidates: [],
      },
      {
        key: 'junta_nac_suplente',
        label: 'Lista Nacional Junta de Gobierno — Suplente',
        cargo: 'Miembro Junta de Gobierno Nacional Suplente',
        tipo: 'PLURINOMINAL',
        titularidad: 'SUPLENTE',
        requiredSeats: seatParams.juntaGobNacionalSuplentes,
        candidates: [],
      },
    ];

    for (const dept of DEPARTAMENTOS_CON_CAPITAL) {
      const pair = seatParams.juntaGobRegionalByDept[dept] || { titulares: 1, suplentes: 1 };
      built.push({
        key: `regional_titular_${dept}`,
        label: `Junta de Gobierno Segmento Regional Titular — ${dept}`,
        cargo: 'Miembro Regional Junta de Gobierno Titular',
        tipo: 'PLURINOMINAL',
        titularidad: 'TITULAR',
        departamento: dept,
        requiredSeats: pair.titulares,
        candidates: [],
      });
      built.push({
        key: `regional_suplente_${dept}`,
        label: `Junta de Gobierno Segmento Regional Suplente — ${dept}`,
        cargo: 'Miembro Regional Junta de Gobierno Suplente',
        tipo: 'PLURINOMINAL',
        titularidad: 'SUPLENTE',
        departamento: dept,
        requiredSeats: pair.suplentes,
        candidates: [],
      });
    }

    setSublists(built);
  }, [seatParams, editingCandidature]);

  const defaultTitle = `Candidaturas ANR Agrupadas (Presidencia + Junta Nacional + 18 Regionales) — Lista ${listNumber}`;
  const effectiveTitle = customTitle !== null ? customTitle : defaultTitle;

  const validation = useMemo(
    () =>
      validateGroupedCandidature(sublists, padronMap, {
        listNumber,
        title: effectiveTitle,
      }),
    [sublists, padronMap, listNumber, effectiveTitle]
  );

  const handleSublistChange = (key: string, updated: CandidatureSublist) => {
    setSublists((prev) => prev.map((s) => (s.key === key ? updated : s)));
  };

  const handleFillAllRegionalVacancies = () => {
    const usedElsewhere = new Set<string>();
    sublists.forEach((s) => {
      s.candidates.forEach((c) => usedElsewhere.add(c.numero_ced));
    });

    const eligiblePool = padronCatalog.filter(
      (r) => Boolean(r.numero_ced) && !usedElsewhere.has(r.numero_ced)
    );
    let poolIdx = 0;

    setSublists((prev) =>
      prev.map((sub) => {
        if (!sub.key.startsWith('regional_') || sub.candidates.length >= sub.requiredSeats) {
          return sub;
        }
        const existingOrders = new Set(sub.candidates.map((c) => c.orden));
        const additions: CandidateEntry[] = [];
        for (let order = 1; order <= sub.requiredSeats; order++) {
          if (existingOrders.has(order)) continue;
          if (poolIdx >= eligiblePool.length) break;
          const rec = eligiblePool[poolIdx++];
          additions.push({
            orden: order,
            numero_ced: rec.numero_ced,
            apellido: rec.apellido,
            nombre: rec.nombre,
            cod_dpto: rec.cod_dpto,
            desc_dep: rec.desc_dep,
            cod_dist: rec.cod_dist,
            desc_dis: rec.desc_dis,
            codigo_sec: rec.codigo_sec,
            fecha_naci: rec.fecha_naci,
            fecha_afil: rec.fecha_afil,
            cargoLabel: sub.cargo,
          });
        }
        return {
          ...sub,
          candidates: [...sub.candidates, ...additions].sort((a, b) => a.orden - b.orden),
        };
      })
    );
  };

  const handleSave = async () => {
    if (!validation.canSave || readOnly) return;
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);
    try {
      const saved = await saveCandidature({
        existingCandidature: editingCandidature,
        moduleType: 'ANR_NACIONAL_REGIONAL',
        title: effectiveTitle || defaultTitle,
        movementName,
        listNumber,
        departamento: 'Nacional y 17 Dptos + Capital',
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
          ? `Paquete ANR "${saved.title}" guardado en estado OBSERVADA (v${saved.versionNumber}) con ${saved.totalCandidates}/${saved.requiredCandidates} escaños: ${saved.reviewComment}`
          : `Paquete ANR "${saved.title}" confirmado (v${saved.versionNumber}) con ${saved.totalCandidates} escaños completos.`
      );
      if (editingCandidature) onClearEditing();
      onSaved(saved);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el paquete ANR en la base electoral.'
      );
    } finally {
      setSaving(false);
    }
  };

  const draftPreviewCandidature: Candidature = {
    id: editingCandidature?.id || 'borrador_anr_preview',
    moduleType: 'ANR_NACIONAL_REGIONAL',
    title: effectiveTitle || defaultTitle,
    movementName: movementName || DEFAULT_MOVEMENT_NAME,
    listNumber,
    departamento: 'Nacional y 17 Dptos + Capital',
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

  const getExcludedCedulas = (currentKey: string): Set<string> => {
    const set = new Set<string>();
    sublists.forEach((s) => {
      if (s.key !== currentKey) {
        s.candidates.forEach((c) => set.add(c.numero_ced));
      }
    });
    return set;
  };

  const visibleSublists = useMemo(() => {
    if (sectionTab === 'presidente_anr') {
      return sublists.filter((s) => s.key === 'presidente_anr');
    }
    if (sectionTab === 'junta_nacional') {
      return sublists.filter(
        (s) => s.key === 'junta_nac_titular' || s.key === 'junta_nac_suplente'
      );
    }
    return sublists.filter(
      (s) =>
        s.key === `regional_titular_${selectedRegionalDept}` ||
        s.key === `regional_suplente_${selectedRegionalDept}`
    );
  }, [sectionTab, selectedRegionalDept, sublists]);

  const regionalCompletedCount = useMemo(() => {
    return DEPARTAMENTOS_CON_CAPITAL.filter((dept) => {
      const t = sublists.find((s) => s.key === `regional_titular_${dept}`);
      const sup = sublists.find((s) => s.key === `regional_suplente_${dept}`);
      return (
        t &&
        sup &&
        t.candidates.length === t.requiredSeats &&
        sup.candidates.length === sup.requiredSeats
      );
    }).length;
  }, [sublists]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSectionTab('presidente_anr')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sectionTab === 'presidente_anr'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Presidente de la A.N.R.
            </button>
            <button
              type="button"
              onClick={() => setSectionTab('junta_nacional')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sectionTab === 'junta_nacional'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2 y 3. Junta de Gobierno Nacional (Tit/Sup)
            </button>
            <button
              type="button"
              onClick={() => setSectionTab('segmento_regional')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sectionTab === 'segmento_regional'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              4. Segmento Regional ({regionalCompletedCount}/18 Distritos)
            </button>
          </div>

          {sectionTab === 'segmento_regional' && !readOnly && (
            <button
              type="button"
              onClick={handleFillAllRegionalVacancies}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              Asignar Habilitados en 18 Regionales
            </button>
          )}
        </div>

        {sectionTab === 'segmento_regional' && (
          <div className="pt-3 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-2">
              Seleccione Departamento o Capital (17 Departamentos + Capital):
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {DEPARTAMENTOS_CON_CAPITAL.map((dept) => {
                const t = sublists.find((s) => s.key === `regional_titular_${dept}`);
                const sup = sublists.find((s) => s.key === `regional_suplente_${dept}`);
                const done =
                  Boolean(t && sup) &&
                  t!.candidates.length === t!.requiredSeats &&
                  sup!.candidates.length === sup!.requiredSeats;
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setSelectedRegionalDept(dept)}
                    className={`px-2.5 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer flex items-center justify-between gap-1 ${
                      selectedRegionalDept === dept
                        ? 'border-[#B91C1C] bg-red-50/70 text-slate-900 font-semibold'
                        : done
                          ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{dept}</span>
                    {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {visibleSublists.map((sub) => (
          <PlurinominalListBuilder
            key={sub.key}
            sublist={sub}
            padronCatalog={padronCatalog}
            padronMap={padronMap}
            onChange={(updated) => handleSublistChange(sub.key, updated)}
            excludedCedulas={getExcludedCedulas(sub.key)}
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
