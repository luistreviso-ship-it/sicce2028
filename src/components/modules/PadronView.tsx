import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  UserPlus,
  Upload,
  CheckCircle2,
  RefreshCw,
  Download,
  AlertCircle,
  Trash2,
  FileSpreadsheet,
  ClipboardList,
  Table2,
  Pencil,
  Save,
  X,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Database,
} from 'lucide-react';
import {
  DEPARTAMENTOS_CON_CAPITAL,
  generateSeedPadronRecords,
} from '../../data/paraguayElectoralData';
import { SECCIONALES_ANR_2026 } from '../../data/seccionalesCatalog';
import {
  addPadronRecord,
  clearPadronDatabase,
  deletePadronRecord,
  importPadronBatch,
  lookupPadronByCedula,
  PadronProgressInfo,
  replacePadronDatabase,
} from '../../services/firestoreService';
import { PadronRecord, UserProfile } from '../../types/electoral';

interface PadronViewProps {
  padronCatalog: PadronRecord[];
  currentUser: UserProfile;
  staffUids: string[];
  onCatalogUpdated: (next: PadronRecord[]) => void;
}

interface ParsedPadronResult {
  records: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[];
  totalDataRows: number;
  skippedInvalid: number;
  duplicatesMerged: number;
}

const TABLE_PAGE_SIZE = 100;

const PADRON_COLUMNS = [
  'cod_dpto',
  'desc_dep',
  'cod_dist',
  'desc_dis',
  'codigo_sec',
  'numero_ced',
  'apellido',
  'nombre',
  'fecha_naci',
  'fecha_afil',
] as const;

function normalizeDateCell(val: unknown, fallback: string): string {
  if (val === null || val === undefined) return fallback;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  if (!str) return fallback;
  // Handle Excel serial date numbers (e.g. 32000)
  if (/^\d{5}$/.test(str)) {
    const parsed = XLSX.SSF.parse_date_code(Number(str));
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  return str.slice(0, 20);
}

function splitCsvLine(line: string, delimiter: string): string[] {
  if (!line.includes('"')) {
    return line.split(delimiter).map((c) => c.trim());
  }
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function deduplicateParsedRows(
  rows: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[],
  totalDataRows: number,
  skippedInvalid: number
): ParsedPadronResult {
  const uniqueMap = new Map<string, Omit<PadronRecord, 'createdByUid' | 'createdAt'>>();
  let duplicatesMerged = 0;
  for (const r of rows) {
    if (uniqueMap.has(r.numero_ced)) {
      duplicatesMerged++;
    }
    uniqueMap.set(r.numero_ced, r);
  }
  return {
    records: Array.from(uniqueMap.values()),
    totalDataRows,
    skippedInvalid,
    duplicatesMerged,
  };
}

function mapRowToPadronRecord(
  rowObj: Record<string, unknown>
): Omit<PadronRecord, 'createdByUid' | 'createdAt'> | null {
  const lowerMap = new Map<string, string>();
  Object.entries(rowObj).forEach(([k, v]) => {
    const cleanKey = k.replace(/^\uFEFF/, '').trim().toLowerCase();
    lowerMap.set(cleanKey, v === null || v === undefined ? '' : String(v).trim());
  });

  const numero_ced = (lowerMap.get('numero_ced') || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const apellido = lowerMap.get('apellido') || '';
  const nombre = lowerMap.get('nombre') || '';
  if (!numero_ced || !apellido || !nombre) return null;

  return {
    cod_dpto: (lowerMap.get('cod_dpto') || '00').slice(0, 10) || '00',
    desc_dep: (lowerMap.get('desc_dep') || 'Capital').slice(0, 60) || 'Capital',
    cod_dist: (lowerMap.get('cod_dist') || '001').slice(0, 15) || '001',
    desc_dis: (lowerMap.get('desc_dis') || 'Asunción').slice(0, 80) || 'Asunción',
    codigo_sec: (lowerMap.get('codigo_sec') || '1').slice(0, 20) || '1',
    numero_ced: numero_ced.slice(0, 20),
    apellido: apellido.slice(0, 100),
    nombre: nombre.slice(0, 100),
    fecha_naci: normalizeDateCell(lowerMap.get('fecha_naci'), '1980-01-01'),
    fecha_afil: normalizeDateCell(lowerMap.get('fecha_afil'), '2012-09-11'),
  };
}

function parseCsvTextFallback(text: string): ParsedPadronResult {
  const cleanedText = text.replace(/^\uFEFF/, '');
  const lines = cleanedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { records: [], totalDataRows: 0, skippedInvalid: 0, duplicatesMerged: 0 };
  }

  const firstLine = lines[0];
  const delimiter = firstLine.includes(';')
    ? ';'
    : firstLine.includes('\t')
      ? '\t'
      : ',';

  const firstCols = splitCsvLine(firstLine, delimiter).map((h) =>
    h.replace(/^\uFEFF/, '').toLowerCase()
  );
  const hasHeader =
    firstCols.includes('numero_ced') ||
    firstCols.includes('cod_dpto') ||
    firstCols.includes('apellido');

  const colIndex: Record<string, number> = {};
  if (hasHeader) {
    PADRON_COLUMNS.forEach((colName) => {
      const idx = firstCols.indexOf(colName);
      if (idx !== -1) colIndex[colName] = idx;
    });
  }

  const startIdx = hasHeader ? 1 : 0;
  const totalDataRows = Math.max(0, lines.length - startIdx);
  const parsed: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[] = [];
  let skippedInvalid = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (cols.length < 8) {
      skippedInvalid++;
      continue;
    }

    const get = (colName: (typeof PADRON_COLUMNS)[number], fallbackIdx: number) => {
      const idx = hasHeader ? colIndex[colName] : fallbackIdx;
      return idx !== undefined && idx >= 0 ? cols[idx] || '' : cols[fallbackIdx] || '';
    };

    const numero_ced = get('numero_ced', 5).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    const apellido = get('apellido', 6).slice(0, 100);
    const nombre = get('nombre', 7).slice(0, 100);
    if (!numero_ced || !apellido || !nombre) {
      skippedInvalid++;
      continue;
    }

    parsed.push({
      cod_dpto: (get('cod_dpto', 0) || '00').slice(0, 10) || '00',
      desc_dep: (get('desc_dep', 1) || 'Capital').slice(0, 60) || 'Capital',
      cod_dist: (get('cod_dist', 2) || '001').slice(0, 15) || '001',
      desc_dis: (get('desc_dis', 3) || 'Asunción').slice(0, 80) || 'Asunción',
      codigo_sec: (get('codigo_sec', 4) || '1').slice(0, 20) || '1',
      numero_ced,
      apellido,
      nombre,
      fecha_naci: normalizeDateCell(get('fecha_naci', 8), '1980-01-01'),
      fecha_afil: normalizeDateCell(get('fecha_afil', 9), '2012-09-11'),
    });
  }

  return deduplicateParsedRows(parsed, totalDataRows, skippedInvalid);
}

async function parsePadronSpreadsheetFile(file: File): Promise<ParsedPadronResult> {
  const lowerName = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('\uFFFD')) {
      try {
        text = new TextDecoder('windows-1252').decode(buffer);
      } catch {
        // Keep UTF-8 decoded text if windows-1252 is unavailable
      }
    }
    const csvResult = parseCsvTextFallback(text);
    if (csvResult.records.length > 0) return csvResult;
  }

  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return { records: [], totalDataRows: 0, skippedInvalid: 0, duplicatesMerged: 0 };
  }
  const ws = wb.Sheets[firstSheetName];

  // Try header-mapped object rows first
  const objRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  });
  const mappedFromHeaders: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[] = [];
  let headerSkipped = 0;
  for (const row of objRows) {
    const mapped = mapRowToPadronRecord(row);
    if (mapped) mappedFromHeaders.push(mapped);
    else headerSkipped++;
  }
  if (mappedFromHeaders.length > 0) {
    return deduplicateParsedRows(mappedFromHeaders, objRows.length, headerSkipped);
  }

  // Fallback to positional 10-column array rows (without header)
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
  const positional: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[] = [];
  let posTotal = 0;
  let posSkipped = 0;
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row) || row.every((c) => String(c || '').trim() === '')) continue;
    const cedCandidate = String(row[5] || '').trim();
    if (i === 0 && cedCandidate.toLowerCase() === 'numero_ced') continue;
    posTotal++;
    if (row.length < 8) {
      posSkipped++;
      continue;
    }
    const numero_ced = cedCandidate.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    const apellido = String(row[6] || '').trim().slice(0, 100);
    const nombre = String(row[7] || '').trim().slice(0, 100);
    if (!numero_ced || !apellido || !nombre) {
      posSkipped++;
      continue;
    }

    positional.push({
      cod_dpto: (String(row[0] || '00').trim() || '00').slice(0, 10),
      desc_dep: (String(row[1] || 'Capital').trim() || 'Capital').slice(0, 60),
      cod_dist: (String(row[2] || '001').trim() || '001').slice(0, 15),
      desc_dis: (String(row[3] || 'Asunción').trim() || 'Asunción').slice(0, 80),
      codigo_sec: (String(row[4] || '1').trim() || '1').slice(0, 20),
      numero_ced,
      apellido,
      nombre,
      fecha_naci: normalizeDateCell(row[8], '1980-01-01'),
      fecha_afil: normalizeDateCell(row[9], '2012-09-11'),
    });
  }
  return deduplicateParsedRows(positional, posTotal, posSkipped);
}

export const PadronView: React.FC<PadronViewProps> = ({
  padronCatalog,
  currentUser,
  staffUids,
  onCatalogUpdated,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [viewMode, setViewMode] = useState<'formulario' | 'tabla'>('formulario');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('TODOS');
  const [tablePage, setTablePage] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Form Consultation State
  const [consultQuery, setConsultQuery] = useState('');
  const [consultDropdownOpen, setConsultDropdownOpen] = useState(false);
  const [consultResult, setConsultResult] = useState<PadronRecord | null>(
    padronCatalog[0] || null
  );
  const [consultNotFound, setConsultNotFound] = useState<string | null>(null);
  const [consultingDb, setConsultingDb] = useState(false);
  const [editingInForm, setEditingInForm] = useState(false);
  const [editFormValues, setEditFormValues] = useState<PadronRecord | null>(null);

  const [form, setForm] = useState({
    cod_dpto: '00',
    desc_dep: 'Capital',
    cod_dist: '001',
    desc_dis: 'Asunción',
    codigo_sec: '1',
    numero_ced: '',
    apellido: '',
    nombre: '',
    fecha_naci: '1985-05-14',
    fecha_afil: '2010-08-11',
  });
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<PadronProgressInfo | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!consultResult && !consultNotFound && padronCatalog.length > 0) {
      setConsultResult(padronCatalog[0]);
    }
  }, [padronCatalog, consultResult, consultNotFound]);

  useEffect(() => {
    setTablePage(1);
  }, [search, deptFilter]);

  const padronByCed = useMemo(() => {
    const map = new Map<string, PadronRecord>();
    for (const r of padronCatalog) {
      if (r.numero_ced) map.set(r.numero_ced, r);
    }
    return map;
  }, [padronCatalog]);

  const consultSuggestions = useMemo(() => {
    const q = consultQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: PadronRecord[] = [];
    for (const r of padronCatalog) {
      if (
        (r.numero_ced || '').toLowerCase().includes(q) ||
        `${r.apellido || ''} ${r.nombre || ''}`.toLowerCase().includes(q) ||
        `${r.nombre || ''} ${r.apellido || ''}`.toLowerCase().includes(q)
      ) {
        matches.push(r);
        if (matches.length >= 8) break;
      }
    }
    return matches;
  }, [consultQuery, padronCatalog]);

  const matchedSeccionalInfo = useMemo(() => {
    if (!consultResult) return null;
    return (
      SECCIONALES_ANR_2026.find(
        (s) =>
          s.codDepto === consultResult.cod_dpto &&
          s.nroSeccional === consultResult.codigo_sec
      ) ||
      SECCIONALES_ANR_2026.find(
        (s) =>
          s.departamento.toLowerCase() === consultResult.desc_dep.toLowerCase() &&
          s.nroSeccional === consultResult.codigo_sec
      ) ||
      null
    );
  }, [consultResult]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return padronCatalog.filter((r) => {
      if (deptFilter !== 'TODOS' && r.desc_dep !== deptFilter) return false;
      if (!q) return true;
      return (
        (r.numero_ced || '').toLowerCase().includes(q) ||
        `${r.apellido || ''} ${r.nombre || ''}`.toLowerCase().includes(q) ||
        `${r.nombre || ''} ${r.apellido || ''}`.toLowerCase().includes(q) ||
        (r.desc_dep || '').toLowerCase().includes(q) ||
        (r.desc_dis || '').toLowerCase().includes(q) ||
        (r.codigo_sec || '').toLowerCase().includes(q) ||
        (r.cod_dpto || '').toLowerCase().includes(q) ||
        (r.cod_dist || '').toLowerCase().includes(q)
      );
    });
  }, [padronCatalog, search, deptFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(tablePage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return filtered.slice(start, start + TABLE_PAGE_SIZE);
  }, [filtered, safePage]);

  const handleSelectConsultRecord = (rec: PadronRecord) => {
    setConsultResult(rec);
    setConsultQuery(rec.numero_ced);
    setConsultDropdownOpen(false);
    setConsultNotFound(null);
    setEditingInForm(false);
    setEditFormValues(null);
  };

  const handleConsultSearch = async () => {
    const clean = consultQuery.trim();
    if (!clean) {
      setConsultNotFound('Ingrese un numero_ced o seleccione un registro del buscador.');
      return;
    }
    setConsultNotFound(null);
    setConsultDropdownOpen(false);
    setEditingInForm(false);

    const local = padronByCed.get(clean);
    if (local) {
      handleSelectConsultRecord(local);
      return;
    }

    setConsultingDb(true);
    try {
      const dbRec = await lookupPadronByCedula(clean);
      if (dbRec) {
        handleSelectConsultRecord(dbRec);
      } else {
        setConsultResult(null);
        setConsultNotFound(
          `No existe ningún registro con numero_ced "${clean}" en la base de datos PadronANR.`
        );
      }
    } finally {
      setConsultingDb(false);
    }
  };

  const handleSaveFormEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editFormValues) return;
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const next = await addPadronRecord(editFormValues, padronCatalog, currentUser, staffUids);
      onCatalogUpdated(next);
      const updatedRec =
        next.find((r) => r.numero_ced === editFormValues.numero_ced) || editFormValues;
      setConsultResult(updatedRec);
      setEditingInForm(false);
      setEditFormValues(null);
      setFeedback(`Registro numero_ced ${updatedRec.numero_ced} actualizado en PadronANR.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrentConsult = async () => {
    if (!isAdmin || !consultResult) return;
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const targetCed = consultResult.numero_ced;
      const next = await deletePadronRecord(targetCed, padronCatalog, currentUser, staffUids);
      onCatalogUpdated(next);
      setConsultResult(next[0] || null);
      setConsultQuery('');
      setEditingInForm(false);
      setFeedback(`Registro numero_ced ${targetCed} eliminado de PadronANR.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al eliminar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !form.numero_ced.trim() || !form.apellido.trim() || !form.nombre.trim()) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const next = await addPadronRecord(form, padronCatalog, currentUser, staffUids);
      onCatalogUpdated(next);
      const added = next.find((r) => r.numero_ced === form.numero_ced.trim());
      if (added) setConsultResult(added);
      setFeedback(`Ciudadano numero_ced ${form.numero_ced} registrado en PadronANR.`);
      setForm({ ...form, numero_ced: '', apellido: '', nombre: '' });
      setShowAddForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrar afiliado.');
    } finally {
      setSaving(false);
    }
  };

  const handleSpreadsheetAction = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'replace' | 'merge'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    setFeedback(null);
    setErrorMsg(null);

    try {
      const parsedResult = await parsePadronSpreadsheetFile(file);
      if (parsedResult.records.length === 0) {
        setErrorMsg(
          'No se detectaron filas válidas. Verifique las 10 columnas: cod_dpto, desc_dep, cod_dist, desc_dis, codigo_sec, numero_ced, apellido, nombre, fecha_naci, fecha_afil.'
        );
        e.target.value = '';
        return;
      }

      setSaving(true);
      setProgress({
        phase: 'Preparando importación',
        completed: 0,
        total: parsedResult.records.length,
      });
      const next =
        mode === 'replace'
          ? await replacePadronDatabase(
              parsedResult.records,
              padronCatalog,
              currentUser,
              staffUids,
              setProgress
            )
          : await importPadronBatch(
              parsedResult.records,
              padronCatalog,
              currentUser,
              staffUids,
              setProgress
            );
      onCatalogUpdated(next);
      setConsultResult(next[0] || null);
      setConsultNotFound(null);
      setTablePage(1);

      const extraNotes: string[] = [];
      if (parsedResult.duplicatesMerged > 0) {
        extraNotes.push(`${parsedResult.duplicatesMerged} cédula(s) duplicada(s) unificadas`);
      }
      if (parsedResult.skippedInvalid > 0) {
        extraNotes.push(`${parsedResult.skippedInvalid} fila(s) omitida(s) por datos incompletos`);
      }
      const notesSuffix = extraNotes.length > 0 ? ` (${extraNotes.join(', ')})` : '';

      setFeedback(
        mode === 'replace'
          ? `Base PadronANR reemplazada desde "${file.name}": ${next.length.toLocaleString()} de ${parsedResult.totalDataRows.toLocaleString()} filas cargadas${notesSuffix}.`
          : `Importados/actualizados ${parsedResult.records.length.toLocaleString()} registro(s) desde "${file.name}" (Total en base: ${next.length.toLocaleString()})${notesSuffix}.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Error al procesar archivo CSV / Excel.'
      );
    } finally {
      setSaving(false);
      setProgress(null);
      e.target.value = '';
    }
  };

  const handleClearDatabase = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setProgress({
      phase: 'Iniciando limpieza de PadronANR',
      completed: 0,
      total: padronCatalog.length,
    });
    setFeedback(null);
    setErrorMsg(null);
    try {
      const next = await clearPadronDatabase(padronCatalog, currentUser, staffUids, setProgress);
      onCatalogUpdated(next);
      setConsultResult(null);
      setConsultQuery('');
      setConsultNotFound(null);
      setConfirmClearOpen(false);
      setTablePage(1);
      setFeedback('Base de datos PadronANR limpiada por completo (0 registros).');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al limpiar PadronANR.');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const handleRestoreBasePadron = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const seeded = generateSeedPadronRecords(currentUser.uid);
      setProgress({
        phase: 'Restaurando registros base',
        completed: 0,
        total: seeded.length,
      });
      const next = await replacePadronDatabase(
        seeded,
        padronCatalog,
        currentUser,
        staffUids,
        setProgress
      );
      onCatalogUpdated(next);
      setConsultResult(next[0] || null);
      setConsultNotFound(null);
      setTablePage(1);
      setFeedback(
        `Base PadronANR restaurada con ${next.length} registros oficiales.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al restaurar PadronANR.');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const header = PADRON_COLUMNS.join(';');
    const source =
      padronCatalog.length > 0
        ? padronCatalog.slice(0, 500)
        : generateSeedPadronRecords(currentUser.uid).slice(0, 10);
    const rows = source.map((r) =>
      [
        r.cod_dpto,
        r.desc_dep,
        r.cod_dist,
        r.desc_dis,
        r.codigo_sec,
        r.numero_ced,
        r.apellido,
        r.nombre,
        r.fecha_naci,
        r.fecha_afil,
      ].join(';')
    );
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'PadronANR_10_campos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const source =
      padronCatalog.length > 0
        ? padronCatalog
        : generateSeedPadronRecords(currentUser.uid).slice(0, 10);
    const rows = source.map((r) => ({
      cod_dpto: r.cod_dpto,
      desc_dep: r.desc_dep,
      cod_dist: r.cod_dist,
      desc_dis: r.desc_dis,
      codigo_sec: r.codigo_sec,
      numero_ced: r.numero_ced,
      apellido: r.apellido,
      nombre: r.nombre,
      fecha_naci: r.fecha_naci,
      fecha_afil: r.fecha_afil,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'PadronANR');
    XLSX.writeFile(wb, 'PadronANR_Base_Electoral.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Base de Datos Electoral PadronANR
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {padronCatalog.length.toLocaleString()} registros indexados · Consulta por cédula o nombre y gestión de base electoral
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => setShowManagePanel((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 border text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 ${
                showManagePanel
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Importar / Base
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Registrar Afiliado
              </button>
            )}
          </div>
        </div>

        {showManagePanel && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Herramientas de carga masiva (CSV / Excel) y mantenimiento de <span className="font-semibold text-slate-800">PadronANR</span>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Plantilla CSV
              </button>

              {isAdmin && (
                <>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    Reemplazar (CSV / Excel)
                    <input
                      type="file"
                      accept=".csv,.txt,.xlsx,.xls"
                      disabled={saving}
                      onChange={(e) => void handleSpreadsheetAction(e, 'replace')}
                      className="hidden"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    Agregar (CSV / Excel)
                    <input
                      type="file"
                      accept=".csv,.txt,.xlsx,.xls"
                      disabled={saving}
                      onChange={(e) => void handleSpreadsheetAction(e, 'merge')}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleRestoreBasePadron()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Restaurar Base
                  </button>
                  <button
                    type="button"
                    disabled={saving || padronCatalog.length === 0}
                    onClick={() => setConfirmClearOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpiar Base
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Inline Confirmation for Clearing Database */}
        {confirmClearOpen && isAdmin && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-red-900">
              <p className="font-bold">Confirmar limpieza total de PadronANR</p>
              <p className="mt-0.5">
                Se eliminarán los {padronCatalog.length} registros actuales de la base PadronANR en Firestore. Luego podrá importar un nuevo archivo CSV o Excel.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmClearOpen(false)}
                className="px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleClearDatabase()}
                className="px-3.5 py-1.5 bg-red-700 text-white text-xs font-semibold rounded-lg hover:bg-red-800 cursor-pointer"
              >
                {saving ? 'Limpiando...' : 'Confirmar Limpieza Total'}
              </button>
            </div>
          </div>
        )}

        {saving && progress && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>{progress.phase}...</span>
              <span className="font-mono tabular-nums text-slate-600">
                {progress.completed.toLocaleString()} / {progress.total.toLocaleString()} (
                {progress.total > 0
                  ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
                  : 0}
                %)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#B91C1C] transition-all duration-150"
                style={{
                  width: `${
                    progress.total > 0
                      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {feedback && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {showAddForm && isAdmin && (
          <form
            onSubmit={(e) => void handleAddSingle(e)}
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
          >
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">cod_dpto</label>
              <input
                required
                placeholder="Ej: 00"
                value={form.cod_dpto}
                onChange={(e) => setForm({ ...form, cod_dpto: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">desc_dep</label>
              <select
                value={form.desc_dep}
                onChange={(e) => setForm({ ...form, desc_dep: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              >
                {DEPARTAMENTOS_CON_CAPITAL.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">cod_dist</label>
              <input
                required
                placeholder="Ej: 001"
                value={form.cod_dist}
                onChange={(e) => setForm({ ...form, cod_dist: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">desc_dis</label>
              <input
                required
                placeholder="Distrito"
                value={form.desc_dis}
                onChange={(e) => setForm({ ...form, desc_dis: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">codigo_sec</label>
              <input
                required
                placeholder="Ej: 1"
                value={form.codigo_sec}
                onChange={(e) => setForm({ ...form, codigo_sec: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">numero_ced</label>
              <input
                required
                placeholder="Cédula"
                value={form.numero_ced}
                onChange={(e) => setForm({ ...form, numero_ced: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">apellido</label>
              <input
                required
                placeholder="Apellidos"
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">nombre</label>
              <input
                required
                placeholder="Nombres"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">fecha_naci</label>
              <input
                required
                placeholder="YYYY-MM-DD"
                value={form.fecha_naci}
                onChange={(e) => setForm({ ...form, fecha_naci: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">fecha_afil</label>
              <input
                required
                placeholder="YYYY-MM-DD"
                value={form.fecha_afil}
                onChange={(e) => setForm({ ...form, fecha_afil: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-5 flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 border border-slate-300 bg-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer"
              >
                {saving ? 'Guardando...' : 'Guardar en PadronANR'}
              </button>
            </div>
          </form>
        )}

        {/* View Switcher: Form Consultation vs Full Table */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('formulario')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                viewMode === 'formulario'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-[#B91C1C]" />
              Consulta en Formulario (Todos los Detalles)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tabla')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                viewMode === 'tabla'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5 text-[#B91C1C]" />
              Tabla PadrónANR ({padronCatalog.length})
            </button>
          </div>
          <span className="text-[11px] text-slate-500">
            Formatos soportados para carga: .csv, .xlsx, .xls
          </span>
        </div>

        {/* VIEW 1: FORM CONSULTATION WITH ALL DETAILS */}
        {viewMode === 'formulario' && (
          <div className="space-y-5 pt-2">
            {/* Search Box for Form Consultation */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <label className="block text-xs font-bold text-slate-800">
                Consultar Ciudadano en PadronANR (por numero_ced, apellido o nombre)
              </label>
              <div className="relative flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={consultQuery}
                    onChange={(e) => {
                      setConsultQuery(e.target.value);
                      setConsultDropdownOpen(true);
                      setConsultNotFound(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleConsultSearch();
                      }
                    }}
                    placeholder="Ingrese numero_ced (ej: 1420000) o apellido..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:border-[#B91C1C]"
                  />

                  {consultDropdownOpen && consultSuggestions.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {consultSuggestions.map((rec) => (
                        <button
                          key={rec.numero_ced}
                          type="button"
                          onClick={() => handleSelectConsultRecord(rec)}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {rec.apellido}, {rec.nombre}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {rec.cod_dpto} {rec.desc_dep} · {rec.cod_dist} {rec.desc_dis} · Sec. {rec.codigo_sec}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-800 shrink-0 tabular-nums">
                            {rec.numero_ced}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={consultingDb}
                  onClick={() => void handleConsultSearch()}
                  className="px-4 py-2.5 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer whitespace-nowrap shrink-0"
                >
                  {consultingDb ? 'Consultando...' : 'Consultar Ficha'}
                </button>
              </div>

              {consultNotFound && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{consultNotFound}</span>
                </div>
              )}
            </div>

            {/* Detailed 10-Field Form Card */}
            {consultResult ? (
              <form
                onSubmit={(e) => void handleSaveFormEdit(e)}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-[#B91C1C]">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {consultResult.apellido}, {consultResult.nombre}
                      </h3>
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        numero_ced: {consultResult.numero_ced} · PadronANR Oficial
                      </p>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      {!editingInForm ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingInForm(true);
                              setEditFormValues({ ...consultResult });
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar Datos
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDeleteCurrentConsult()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingInForm(false);
                              setEditFormValues(null);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Section 1: Datos Personales */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    1. Identificación y Afiliación
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        numero_ced (Cédula)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.numero_ced
                            : consultResult.numero_ced
                        }
                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-900 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        apellido
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.apellido
                            : consultResult.apellido
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, apellido: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-semibold text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        nombre
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.nombre
                            : consultResult.nombre
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, nombre: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-semibold text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        fecha_naci (Nacimiento)
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.fecha_naci
                            : consultResult.fecha_naci
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, fecha_naci: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tabular-nums text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        fecha_afil (Afiliación ANR)
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.fecha_afil
                            : consultResult.fecha_afil
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, fecha_afil: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tabular-nums text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Jurisdicción Electoral */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    2. Jurisdicción Electoral y Seccional ANR
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        cod_dpto
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.cod_dpto
                            : consultResult.cod_dpto
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, cod_dpto: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tabular-nums text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        desc_dep (Departamento)
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.desc_dep
                            : consultResult.desc_dep
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, desc_dep: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-medium text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        cod_dist
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.cod_dist
                            : consultResult.cod_dist
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, cod_dist: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tabular-nums text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        desc_dis (Distrito)
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.desc_dis
                            : consultResult.desc_dis
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, desc_dis: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-medium text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        codigo_sec (Seccional)
                      </label>
                      <input
                        type="text"
                        readOnly={!editingInForm}
                        value={
                          editingInForm && editFormValues
                            ? editFormValues.codigo_sec
                            : consultResult.codigo_sec
                        }
                        onChange={(e) =>
                          editFormValues &&
                          setEditFormValues({ ...editFormValues, codigo_sec: e.target.value })
                        }
                        className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tabular-nums text-slate-900 ${
                          editingInForm
                            ? 'bg-white border-slate-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                  </div>

                  {matchedSeccionalInfo && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Seccional Asociada:{' '}
                        <strong className="text-slate-900">
                          Secc. {matchedSeccionalInfo.nroSeccional} — {matchedSeccionalInfo.nombre}
                        </strong>
                      </span>
                      <span className="font-mono text-slate-500">
                        {matchedSeccionalInfo.distrito} ({matchedSeccionalInfo.departamento})
                      </span>
                    </div>
                  )}
                </div>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
                {padronCatalog.length === 0
                  ? 'La base de datos PadronANR está vacía. Importe un archivo CSV/Excel o restaure la base.'
                  : 'Busque un ciudadano por numero_ced, apellido o nombre para visualizar su formulario completo.'}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: FULL 10-COLUMN TABLE WITH PAGINATION */}
        {viewMode === 'tabla' && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar tabla por numero_ced, apellido, nombre, desc_dep, desc_dis o codigo_sec..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
                />
              </div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
              >
                <option value="TODOS">Todos los Departamentos (desc_dep)</option>
                {DEPARTAMENTOS_CON_CAPITAL.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <span className="tabular-nums">
                {filtered.length === 0
                  ? '0 registros coincidentes'
                  : `Mostrando ${((safePage - 1) * TABLE_PAGE_SIZE + 1).toLocaleString()}–${Math.min(
                      safePage * TABLE_PAGE_SIZE,
                      filtered.length
                    ).toLocaleString()} de ${filtered.length.toLocaleString()} registros`}
              </span>
              {totalPages > 1 && (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 bg-white rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </button>
                  <span className="px-2 font-mono tabular-nums text-slate-700">
                    Página {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 bg-white rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    Siguiente
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-mono font-semibold text-slate-700">
                    <th className="py-2.5 px-3 whitespace-nowrap">cod_dpto</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">desc_dep</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">cod_dist</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">desc_dis</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">codigo_sec</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">numero_ced</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">apellido</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">nombre</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">fecha_naci</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">fecha_afil</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Ficha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-500">
                        Sin registros para mostrar en PadronANR.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((rec) => (
                      <tr
                        key={rec.numero_ced}
                        onClick={() => {
                          handleSelectConsultRecord(rec);
                          setViewMode('formulario');
                        }}
                        className="hover:bg-slate-50/90 cursor-pointer"
                      >
                        <td className="py-2 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {rec.cod_dpto}
                        </td>
                        <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                          {rec.desc_dep}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {rec.cod_dist}
                        </td>
                        <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                          {rec.desc_dis}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                          {rec.codigo_sec}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {rec.numero_ced}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900 whitespace-nowrap">
                          {rec.apellido}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900 whitespace-nowrap">
                          {rec.nombre}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {rec.fecha_naci}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {rec.fecha_afil}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <span className="text-[#B91C1C] font-semibold hover:underline">
                            Ver Formulario
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
