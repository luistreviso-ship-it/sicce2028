export type UserRole = 'admin' | 'operador' | 'revisor';

export const SYSTEM_NAME = 'Sistema de Cargas de Candidaturas Electoral - SICCE';
export const DEFAULT_MOVEMENT_NAME = 'Colorado Añeteté - Arnoldo Wiens Presidente 2028';

export interface UserPermissions {
  alta: boolean;
  baja: boolean;
  modificacion: boolean;
}

export function getDefaultPermissionsForRole(role: UserRole): UserPermissions {
  if (role === 'admin') {
    return { alta: true, baja: true, modificacion: true };
  }
  if (role === 'operador') {
    return { alta: true, baja: false, modificacion: true };
  }
  return { alta: false, baja: false, modificacion: true };
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  permissions?: UserPermissions;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserInvitation {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermissions;
  active: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeptSeatPair {
  titulares: number;
  suplentes: number;
}

export interface SeccionalSeatConfig {
  id: string;
  codDepto?: string;
  nroSeccional?: string;
  nombre: string;
  departamento: string;
  distrito: string;
  miembrosTitulares: number;
  miembrosSuplentes: number;
  convencionalesTitulares: number;
  convencionalesSuplentes: number;
}

export interface SeatParameters {
  id: string;
  deadlineNacional: string;
  deadlineAnr: string;
  deadlineSeccional: string;
  senadoresTitulares: number;
  senadoresSuplentes: number;
  juntaGobNacionalTitulares: number;
  juntaGobNacionalSuplentes: number;
  diputadosByDept: Record<string, DeptSeatPair>;
  juntaDeptByDept: Record<string, DeptSeatPair>;
  juntaGobRegionalByDept: Record<string, DeptSeatPair>;
  seccionalesConfig: Record<string, SeccionalSeatConfig>;
  updatedByUid: string;
  updatedAt?: unknown;
}

export interface PadronRecord {
  cod_dpto: string;
  desc_dep: string;
  cod_dist: string;
  desc_dis: string;
  codigo_sec: string;
  numero_ced: string;
  apellido: string;
  nombre: string;
  fecha_naci: string;
  fecha_afil: string;
  createdByUid?: string;
  createdAt?: unknown;
}

export type CandidatureModuleType =
  | 'NACIONAL_PRESIDENCIA'
  | 'NACIONAL_SENADORES'
  | 'NACIONAL_DIPUTADOS'
  | 'NACIONAL_GOBERNACION'
  | 'ANR_NACIONAL_REGIONAL'
  | 'SECCIONAL_ANR';

export type ReviewStatus = 'PENDIENTE' | 'APROBADA' | 'OBSERVADA';

export interface CandidateEntry {
  orden: number;
  numero_ced: string;
  apellido: string;
  nombre: string;
  telefono?: string;
  cod_dpto: string;
  desc_dep: string;
  cod_dist: string;
  desc_dis: string;
  codigo_sec: string;
  fecha_naci: string;
  fecha_afil: string;
  cargoLabel?: string;
  observacion?: string;
}

export interface CandidatureSublist {
  key: string;
  label: string;
  cargo: string;
  tipo: 'UNIPERSONAL' | 'PLURINOMINAL';
  titularidad: 'TITULAR' | 'SUPLENTE' | 'UNICO';
  departamento?: string;
  seccional?: string;
  requiredSeats: number;
  candidates: CandidateEntry[];
}

export interface FiscalizacionChecklist {
  pagoAportePartidario: boolean;
  fotocopiaCedula: boolean;
  fotoCarnet3x4: boolean;
  aceptacionesTriplicado: boolean;
  autenticacionAceptaciones: boolean;
  observaciones?: string;
  fiscalizadoPorUid?: string;
  fiscalizadoPorName?: string;
  updatedAtIso?: string;
}

export interface Candidature {
  id: string;
  moduleType: CandidatureModuleType;
  title: string;
  movementName: string;
  listNumber: string;
  departamento: string;
  seccional: string;
  sublists: CandidatureSublist[];
  totalCandidates: number;
  requiredCandidates: number;
  isComplete: boolean;
  reviewStatus: ReviewStatus;
  reviewComment: string;
  reviewedByUid: string;
  versionNumber: number;
  fiscalizacion?: FiscalizacionChecklist;
  createdByUid: string;
  createdByName: string;
  authorizedUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DocumentType =
  | 'PAGO_APORTE_PARTIDARIO'
  | 'CEDULA_IDENTIDAD'
  | 'FOTO_CARNET_3X4'
  | 'ACEPTACION_TRIPLICADO'
  | 'AUTENTICACION_ACEPTACION'
  | 'CARTA_RESPALDO'
  | 'CERTIFICADO_AFILIACION'
  | 'ACTA_COMPROMISO'
  | 'OTRO';

export interface CandidatureDocument {
  id: string;
  candidatureId: string;
  docType: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  uploadedByUid: string;
  uploadedByName: string;
  authorizedUids: string[];
  createdAt?: unknown;
}

export interface ListVersion {
  id: string;
  candidatureId: string;
  moduleType: string;
  title: string;
  versionNumber: number;
  changeNote: string;
  snapshotSublists: CandidatureSublist[];
  totalCandidates: number;
  createdByUid: string;
  createdByName: string;
  authorizedUids: string[];
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  authorizedUids: string[];
  createdAt?: unknown;
}

export interface NotificationItem {
  id: string;
  targetUid: string;
  title: string;
  message: string;
  category: 'CONFIRMACION' | 'REVISION' | 'VENCIMIENTO' | 'SISTEMA';
  read: boolean;
  createdAt?: unknown;
}

export interface SystemDirectory {
  id: string;
  staffUids: string[];
  candidatureIds: string[];
  invitationIds?: string[];
  updatedAt?: unknown;
}

export type AppRoute =
  | 'dashboard'
  | 'nacional'
  | 'anr'
  | 'seccionales'
  | 'fiscalizacion'
  | 'parametros'
  | 'padron'
  | 'reportes'
  | 'auditoria'
  | 'usuarios';
