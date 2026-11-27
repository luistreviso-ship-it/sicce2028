import {
  CandidateEntry,
  CandidatureModuleType,
  CandidatureSublist,
  PadronRecord,
} from '../types/electoral';

export interface SublistEligibilityRules {
  minAge?: number;
  minAffiliationYears?: number;
  requiredDepartamento?: string;
  requiredDeptCode?: number | null;
  requiredSeccional?: string;
  requiredSeccionalCode?: number | null;
  seccionalDepartamento?: string;
  seccionalDeptCode?: number | null;
  ruleSummary?: string;
}

export interface CandidateEligibilityResult {
  valid: boolean;
  blockingValid: boolean;
  ageValid: boolean;
  seccionalValid: boolean;
  errors: string[];
  blockingErrors: string[];
  ageErrors: string[];
  seccionalErrors: string[];
  ageYears: number | null;
  affiliationYears: number | null;
}

export interface SublistValidationResult {
  key: string;
  label: string;
  valid: boolean;
  isComplete: boolean;
  loadedCount: number;
  requiredSeats: number;
  blockingErrors: string[];
  ageObservations: string[];
  seccionalObservations: string[];
  warnings: string[];
  errors: string[];
}

export interface CandidatureValidationSummary {
  valid: boolean;
  canSave: boolean;
  isComplete: boolean;
  hasObservations: boolean;
  totalLoaded: number;
  totalRequired: number;
  sublistResults: SublistValidationResult[];
  globalErrors: string[];
  blockingErrors: string[];
  ageObservations: string[];
  seccionalObservations: string[];
  warnings: string[];
  autoObservationText: string;
}

const DEPT_CODE_BY_NAME: Record<string, number> = {
  capital: 0,
  asuncion: 0,
  concepcion: 1,
  'san pedro': 2,
  cordillera: 3,
  guaira: 4,
  caaguazu: 5,
  caazapa: 6,
  itapua: 7,
  misiones: 8,
  paraguari: 9,
  'alto parana': 10,
  central: 11,
  neembucu: 12,
  amambay: 13,
  canindeyu: 14,
  'presidente hayes': 15,
  'alto paraguay': 16,
  boqueron: 17,
};

export function normalizeElectoralText(value: string | undefined | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getDepartmentCode(deptOrCode: string | undefined | null): number | null {
  const raw = (deptOrCode || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  const norm = normalizeElectoralText(raw);
  return norm in DEPT_CODE_BY_NAME ? DEPT_CODE_BY_NAME[norm] : null;
}

export function extractSeccionalNumber(value: string | undefined | null): number | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  const match =
    /(?:secc(?:ional)?\.?|n[°º.]?)\s*0*(\d+)/i.exec(raw) || /^0*(\d+)\b/.exec(raw);
  if (match) {
    return Number(match[1]);
  }
  return null;
}

export function parseElectoralDate(value: string | undefined | null): Date | null {
  const raw = (value || '').trim();
  if (!raw) return null;

  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return d;
    }
    return null;
  }

  // Day-first format used in Padron CSVs: D/M/YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(raw);
  if (dmyMatch) {
    let day = Number(dmyMatch[1]);
    let month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return d;
    }
    return null;
  }

  return null;
}

export function calculateCompletedYears(fromDate: Date, refDate: Date = new Date()): number {
  let years = refDate.getFullYear() - fromDate.getFullYear();
  const mDiff = refDate.getMonth() - fromDate.getMonth();
  if (mDiff < 0 || (mDiff === 0 && refDate.getDate() < fromDate.getDate())) {
    years--;
  }
  return years;
}

export function getSublistEligibilityRules(
  moduleType?: CandidatureModuleType,
  sublist?: Pick<CandidatureSublist, 'departamento' | 'seccional'>,
  fallbackDepartamento?: string,
  fallbackSeccional?: string
): SublistEligibilityRules {
  if (moduleType === 'NACIONAL_PRESIDENCIA') {
    return {
      minAge: 35,
      minAffiliationYears: 1,
      ruleSummary: 'Requisitos constitucionales: Edad >= 35 años · Afiliación >= 1 año',
    };
  }
  if (moduleType === 'NACIONAL_SENADORES') {
    return {
      minAge: 35,
      minAffiliationYears: 1,
      ruleSummary: 'Requisitos constitucionales: Edad >= 35 años · Afiliación >= 1 año',
    };
  }
  if (moduleType === 'NACIONAL_DIPUTADOS' || moduleType === 'NACIONAL_GOBERNACION') {
    const dept = (sublist?.departamento || fallbackDepartamento || '').trim();
    const deptCode = getDepartmentCode(dept);
    const codeText = deptCode !== null ? ` (cod_dpto ${deptCode})` : '';
    return {
      minAge: 25,
      minAffiliationYears: 1,
      requiredDepartamento: dept || undefined,
      requiredDeptCode: deptCode,
      ruleSummary: dept
        ? `Requisitos: Pertenecer a ${dept}${codeText} · Edad >= 25 años · Afiliación >= 1 año`
        : 'Requisitos: Pertenecer al Departamento · Edad >= 25 años · Afiliación >= 1 año',
    };
  }
  if (moduleType === 'SECCIONAL_ANR') {
    const dept = (sublist?.departamento || fallbackDepartamento || '').trim();
    const deptCode = getDepartmentCode(dept);
    const sec = (sublist?.seccional || fallbackSeccional || '').trim();
    const secCode = extractSeccionalNumber(sec);
    const secDesc = sec || (secCode !== null ? `Seccional ${secCode}` : 'la Seccional postulada');
    return {
      minAffiliationYears: 1,
      requiredSeccional: sec || undefined,
      requiredSeccionalCode: secCode,
      seccionalDepartamento: dept || undefined,
      seccionalDeptCode: deptCode,
      ruleSummary: `Requisitos Seccional ANR: Antigüedad de afiliación >= 1 año · Pertenecer a ${secDesc}${dept ? ` (${dept})` : ''} (si figura en otra, pasa a Observación indicando su Seccional)`,
    };
  }
  return {};
}

function matchesDepartment(
  candCodDpto: string | undefined,
  candDescDep: string | undefined,
  targetDept: string | undefined,
  targetDeptCode?: number | null
): boolean {
  if (!targetDept && (targetDeptCode === null || targetDeptCode === undefined)) {
    return true;
  }
  const candDeptCode = getDepartmentCode(candCodDpto);
  const candDescNorm = normalizeElectoralText(candDescDep);
  const reqDescNorm = normalizeElectoralText(targetDept);
  const reqCode =
    targetDeptCode !== undefined ? targetDeptCode : getDepartmentCode(targetDept);

  const codeMatches =
    reqCode !== null && candDeptCode !== null && candDeptCode === reqCode;
  const nameMatches =
    Boolean(candDescNorm) &&
    Boolean(reqDescNorm) &&
    (candDescNorm === reqDescNorm ||
      (reqCode === 0 && (candDescNorm === 'asuncion' || candDescNorm === 'capital')));

  return codeMatches || nameMatches;
}

export function validateCandidateEligibility(
  candidate: {
    numero_ced: string;
    apellido: string;
    nombre: string;
    cod_dpto: string;
    desc_dep: string;
    desc_dis?: string;
    codigo_sec?: string;
    fecha_naci: string;
    fecha_afil: string;
  },
  rules: SublistEligibilityRules,
  refDate: Date = new Date()
): CandidateEligibilityResult {
  const blockingErrors: string[] = [];
  const ageErrors: string[] = [];
  const seccionalErrors: string[] = [];
  const birthDate = parseElectoralDate(candidate.fecha_naci);
  const afilDate = parseElectoralDate(candidate.fecha_afil);
  const ageYears = birthDate ? calculateCompletedYears(birthDate, refDate) : null;
  const affiliationYears = afilDate ? calculateCompletedYears(afilDate, refDate) : null;

  if (rules.requiredDepartamento) {
    const deptMatches = matchesDepartment(
      candidate.cod_dpto,
      candidate.desc_dep,
      rules.requiredDepartamento,
      rules.requiredDeptCode
    );
    if (!deptMatches) {
      const reqCode =
        rules.requiredDeptCode !== undefined
          ? rules.requiredDeptCode
          : getDepartmentCode(rules.requiredDepartamento);
      const reqCodeNote = reqCode !== null ? ` (cod_dpto ${reqCode})` : '';
      blockingErrors.push(
        `C.I. ${candidate.numero_ced} (${candidate.nombre} ${candidate.apellido}) pertenece a ${candidate.desc_dep || 'Sin Dpto.'} (cod_dpto ${candidate.cod_dpto || '-'}), pero debe pertenecer a ${rules.requiredDepartamento}${reqCodeNote}.`
      );
    }
  }

  if (rules.requiredSeccional || rules.requiredSeccionalCode != null) {
    const candSecCode = extractSeccionalNumber(candidate.codigo_sec);
    const reqSecCode =
      rules.requiredSeccionalCode !== undefined
        ? rules.requiredSeccionalCode
        : extractSeccionalNumber(rules.requiredSeccional);

    const secNumMatches =
      reqSecCode !== null && candSecCode !== null
        ? candSecCode === reqSecCode
        : normalizeElectoralText(candidate.codigo_sec) !== '' &&
          normalizeElectoralText(rules.requiredSeccional).includes(
            normalizeElectoralText(candidate.codigo_sec)
          );

    const deptMatches = matchesDepartment(
      candidate.cod_dpto,
      candidate.desc_dep,
      rules.seccionalDepartamento,
      rules.seccionalDeptCode
    );

    if (!secNumMatches || !deptMatches) {
      const actualSec = candidate.codigo_sec?.trim()
        ? `Seccional ${candidate.codigo_sec.trim()}`
        : 'Seccional sin registro';
      const actualGeo = [candidate.desc_dep, candidate.desc_dis]
        .filter((v) => Boolean(v && v.trim()))
        .join(' / ');
      const targetLabel = `${rules.requiredSeccional || `Seccional ${reqSecCode ?? ''}`}${
        rules.seccionalDepartamento ? ` de ${rules.seccionalDepartamento}` : ''
      }`;
      seccionalErrors.push(
        `Observación de seccional: C.I. ${candidate.numero_ced} (${candidate.nombre} ${candidate.apellido}) figura en ${actualSec}${actualGeo ? ` (${actualGeo})` : ''}, no en ${targetLabel}.`
      );
    }
  }

  if (rules.minAge !== undefined) {
    if (ageYears === null) {
      ageErrors.push(
        `Observación de edad: C.I. ${candidate.numero_ced} (${candidate.nombre} ${candidate.apellido}) posee fecha_naci inválida ("${candidate.fecha_naci || 'Sin registro'}") para verificar edad >= ${rules.minAge} años.`
      );
    } else if (ageYears < rules.minAge) {
      ageErrors.push(
        `Observación de edad: C.I. ${candidate.numero_ced} (${candidate.nombre} ${candidate.apellido}) tiene ${ageYears} años (fecha_naci: ${candidate.fecha_naci}); mínimo requerido ${rules.minAge} años.`
      );
    }
  }

  if (rules.minAffiliationYears !== undefined) {
    if (affiliationYears === null) {
      blockingErrors.push(
        `C.I. ${candidate.numero_ced} (${candidate.nombre} ${candidate.apellido}) posee fecha de afiliación inválida ("${candidate.fecha_afil}") para verificar antigüedad >= 1 año.`
      );
    } else if (affiliationYears < rules.minAffiliationYears) {
      blockingErrors.push(
        `C.I. ${candidate.numero_ced} (${candidate.nombre} ${candidate.apellido}) no cumple la antigüedad de afiliación de al menos 1 año (fecha_afil: ${candidate.fecha_afil}).`
      );
    }
  }

  const errors = [...blockingErrors, ...ageErrors, ...seccionalErrors];
  return {
    valid: errors.length === 0,
    blockingValid: blockingErrors.length === 0,
    ageValid: ageErrors.length === 0,
    seccionalValid: seccionalErrors.length === 0,
    errors,
    blockingErrors,
    ageErrors,
    seccionalErrors,
    ageYears,
    affiliationYears,
  };
}

export function validateSublist(
  sublist: CandidatureSublist,
  padronMap: Map<string, PadronRecord>,
  options?: { moduleType?: CandidatureModuleType; departamento?: string; seccional?: string }
): SublistValidationResult {
  const blockingErrors: string[] = [];
  const ageObservations: string[] = [];
  const seccionalObservations: string[] = [];
  const warnings: string[] = [];
  const { candidates, requiredSeats, label } = sublist;
  const rules = getSublistEligibilityRules(
    options?.moduleType,
    sublist,
    options?.departamento,
    options?.seccional
  );

  if (candidates.length < requiredSeats) {
    warnings.push(
      `Faltan ${requiredSeats - candidates.length} candidato(s) en "${label}" (${candidates.length}/${requiredSeats} escaños cargados).`
    );
  } else if (candidates.length > requiredSeats) {
    blockingErrors.push(
      `Excede los escaños asignados en "${label}" (${candidates.length}/${requiredSeats}).`
    );
  }

  const seenOrders = new Set<number>();
  const seenCedulas = new Set<string>();

  for (const cand of candidates) {
    const ced = (cand.numero_ced || '').trim();
    // 1. Validate PadronANR existence
    const padronEntry = padronMap.get(ced);
    if (!padronEntry) {
      blockingErrors.push(
        `La C.I. ${ced} (${cand.nombre} ${cand.apellido}) no figura en la base de datos PadronANR.`
      );
    }

    // 2. Validate electoral eligibility rules (dept/affiliation blocking, age & seccional -> automatic observation)
    const sourceRecord = padronEntry || cand;
    const eligibility = validateCandidateEligibility(sourceRecord, rules);
    if (eligibility.blockingErrors.length > 0) {
      blockingErrors.push(...eligibility.blockingErrors);
    }
    if (eligibility.ageErrors.length > 0) {
      ageObservations.push(...eligibility.ageErrors);
      warnings.push(...eligibility.ageErrors);
    }
    if (eligibility.seccionalErrors.length > 0) {
      seccionalObservations.push(...eligibility.seccionalErrors);
      warnings.push(...eligibility.seccionalErrors);
    }

    // 3. Validate unique cedula within same sublist
    if (seenCedulas.has(ced)) {
      blockingErrors.push(
        `C.I. duplicada (${ced}) dentro de la lista "${label}".`
      );
    }
    seenCedulas.add(ced);

    // 4. Validate order number
    if (!Number.isInteger(cand.orden) || cand.orden < 1 || cand.orden > requiredSeats) {
      blockingErrors.push(
        `Número de orden inválido (${cand.orden}) para C.I. ${ced} en "${label}". Debe estar entre 1 y ${requiredSeats}.`
      );
    } else if (seenOrders.has(cand.orden)) {
      blockingErrors.push(
        `El número de orden #${cand.orden} está repetido en "${label}". Cada candidato debe tener un orden único.`
      );
    }
    seenOrders.add(cand.orden);
  }

  // Verify no missing order positions 1..requiredSeats when count matches
  if (candidates.length === requiredSeats) {
    for (let pos = 1; pos <= requiredSeats; pos++) {
      if (!seenOrders.has(pos)) {
        blockingErrors.push(`Falta asignar el número de orden #${pos} en "${label}".`);
      }
    }
  }

  const isComplete = candidates.length === requiredSeats && blockingErrors.length === 0;
  const errors = [...blockingErrors, ...warnings];

  return {
    key: sublist.key,
    label,
    valid: blockingErrors.length === 0 && warnings.length === 0,
    isComplete,
    loadedCount: candidates.length,
    requiredSeats,
    blockingErrors,
    ageObservations,
    seccionalObservations,
    warnings,
    errors,
  };
}

export function validateGroupedCandidature(
  sublists: CandidatureSublist[],
  padronMap: Map<string, PadronRecord>,
  metadata: {
    listNumber: string;
    title: string;
    moduleType?: CandidatureModuleType;
    departamento?: string;
    seccional?: string;
  }
): CandidatureValidationSummary {
  const globalErrors: string[] = [];

  if (!metadata.listNumber.trim()) {
    globalErrors.push('Debe seleccionar la Lista (A, B, C o D).');
  }

  const sublistResults = sublists.map((sub) =>
    validateSublist(sub, padronMap, {
      moduleType: metadata.moduleType,
      departamento: metadata.departamento,
      seccional: metadata.seccional,
    })
  );

  // Cross-sublist check: prevent same person being in two incompatible sublists of same package
  const cedulaToCargoMap = new Map<string, string>();
  for (const sub of sublists) {
    for (const cand of sub.candidates) {
      const ced = (cand.numero_ced || '').trim();
      const existingSub = cedulaToCargoMap.get(ced);
      if (existingSub && existingSub !== sub.label) {
        globalErrors.push(
          `El candidato C.I. ${ced} (${cand.nombre} ${cand.apellido}) no puede figurar simultáneamente en "${existingSub}" y "${sub.label}".`
        );
      } else {
        cedulaToCargoMap.set(ced, sub.label);
      }
    }
  }

  const totalLoaded = sublistResults.reduce((acc, r) => acc + r.loadedCount, 0);
  const totalRequired = sublistResults.reduce((acc, r) => acc + r.requiredSeats, 0);
  const blockingErrors = [
    ...globalErrors,
    ...sublistResults.flatMap((r) => r.blockingErrors),
  ];
  const ageObservations = sublistResults.flatMap((r) => r.ageObservations);
  const seccionalObservations = sublistResults.flatMap((r) => r.seccionalObservations);
  const warnings = sublistResults.flatMap((r) => r.warnings);
  const isComplete =
    totalRequired > 0 &&
    totalLoaded === totalRequired &&
    sublistResults.every((r) => r.loadedCount === r.requiredSeats);
  const hasObservations =
    !isComplete || ageObservations.length > 0 || seccionalObservations.length > 0;

  const missingDetails = sublistResults
    .filter((r) => r.loadedCount < r.requiredSeats)
    .map((r) => `${r.label} (${r.loadedCount}/${r.requiredSeats})`)
    .join('; ');
  const obsParts: string[] = [];
  if (ageObservations.length > 0) {
    obsParts.push(ageObservations.join(' '));
  }
  if (seccionalObservations.length > 0) {
    obsParts.push(seccionalObservations.join(' '));
  }
  if (!isComplete) {
    obsParts.push(
      `Candidatura incompleta (${totalLoaded}/${totalRequired} escaños). Pendientes: ${missingDetails}.`
    );
  }
  const autoObservationText = obsParts.join(' | ').slice(0, 500);

  const valid =
    blockingErrors.length === 0 &&
    isComplete &&
    ageObservations.length === 0 &&
    seccionalObservations.length === 0;
  const canSave = blockingErrors.length === 0 && totalLoaded >= 1;

  return {
    valid,
    canSave,
    isComplete,
    hasObservations,
    totalLoaded,
    totalRequired,
    sublistResults,
    globalErrors,
    blockingErrors,
    ageObservations,
    seccionalObservations,
    warnings,
    autoObservationText,
  };
}

export interface OrderedCandidatureSlot {
  orden: number;
  candidate: CandidateEntry | null;
  isEmpty: boolean;
  fullName: string;
  cedula: string;
  telefono: string;
  observacion: string;
  ageYears: number | null;
  hasAgeObservation: boolean;
  hasSeccionalObservation: boolean;
}

export function getCandidateObservationText(
  cand: CandidateEntry,
  rules: SublistEligibilityRules,
  padronRecord?: PadronRecord
): {
  text: string;
  ageYears: number | null;
  hasAgeObservation: boolean;
  hasSeccionalObservation: boolean;
} {
  const src = padronRecord || cand;
  const elig = validateCandidateEligibility(src, rules);
  const parts: string[] = [];
  if (elig.ageErrors.length > 0) {
    parts.push(
      elig.ageYears !== null
        ? `Edad ${elig.ageYears} años (< ${rules.minAge} años)`
        : `fecha_naci inválida (${src.fecha_naci || 's/d'})`
    );
  }
  if (elig.seccionalErrors.length > 0) {
    const actualSec = src.codigo_sec?.trim()
      ? `Seccional ${src.codigo_sec.trim()}`
      : 'Seccional s/d';
    const actualGeo = [src.desc_dep, src.desc_dis]
      .filter((v) => Boolean(v && v.trim()))
      .join(' · ');
    parts.push(`Figura en ${actualSec}${actualGeo ? ` (${actualGeo})` : ''}`);
  }
  if (cand.observacion && cand.observacion.trim()) {
    parts.push(cand.observacion.trim());
  }
  return {
    text: parts.join(' · ') || 'Sin observación',
    ageYears: elig.ageYears,
    hasAgeObservation: !elig.ageValid,
    hasSeccionalObservation: !elig.seccionalValid,
  };
}

export function buildOrderedSublistSlots(
  sublist: CandidatureSublist,
  options?: {
    moduleType?: CandidatureModuleType;
    departamento?: string;
    seccional?: string;
    padronMap?: Map<string, PadronRecord>;
  }
): OrderedCandidatureSlot[] {
  const rules = getSublistEligibilityRules(
    options?.moduleType,
    sublist,
    options?.departamento,
    options?.seccional
  );
  const byOrder = new Map<number, CandidateEntry>();
  const extras: CandidateEntry[] = [];

  const sorted = [...sublist.candidates].sort((a, b) => a.orden - b.orden);
  for (const cand of sorted) {
    if (cand.orden >= 1 && cand.orden <= sublist.requiredSeats && !byOrder.has(cand.orden)) {
      byOrder.set(cand.orden, cand);
    } else {
      extras.push(cand);
    }
  }

  const slots: OrderedCandidatureSlot[] = [];
  for (let pos = 1; pos <= sublist.requiredSeats; pos++) {
    const cand = byOrder.get(pos) || null;
    if (!cand) {
      slots.push({
        orden: pos,
        candidate: null,
        isEmpty: true,
        fullName: 'Sin Registro',
        cedula: 'Sin Registro',
        telefono: 'Sin Registro',
        observacion: 'Sin Registro',
        ageYears: null,
        hasAgeObservation: false,
        hasSeccionalObservation: false,
      });
    } else {
      const padronRec = options?.padronMap?.get(cand.numero_ced);
      const obs = getCandidateObservationText(cand, rules, padronRec);
      slots.push({
        orden: pos,
        candidate: cand,
        isEmpty: false,
        fullName: `${cand.nombre} ${cand.apellido}`.trim() || 'Sin Registro',
        cedula: cand.numero_ced || 'Sin Registro',
        telefono: cand.telefono?.trim() || 'Sin Registro',
        observacion: obs.text,
        ageYears: obs.ageYears,
        hasAgeObservation: obs.hasAgeObservation,
        hasSeccionalObservation: obs.hasSeccionalObservation,
      });
    }
  }

  for (const cand of extras) {
    const padronRec = options?.padronMap?.get(cand.numero_ced);
    const obs = getCandidateObservationText(cand, rules, padronRec);
    slots.push({
      orden: cand.orden,
      candidate: cand,
      isEmpty: false,
      fullName: `${cand.nombre} ${cand.apellido}`.trim() || 'Sin Registro',
      cedula: cand.numero_ced || 'Sin Registro',
      telefono: cand.telefono?.trim() || 'Sin Registro',
      observacion: `${obs.text}${obs.text !== 'Sin observación' ? ' · ' : ''}Orden duplicado o fuera de rango`,
      ageYears: obs.ageYears,
      hasAgeObservation: obs.hasAgeObservation,
      hasSeccionalObservation: obs.hasSeccionalObservation,
    });
  }

  return slots;
}
