import { User } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  buildDefaultSeccionalesConfig,
  createDefaultSeatParameters,
  generateSeedPadronRecords,
} from '../data/paraguayElectoralData';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AuditLog,
  Candidature,
  CandidatureDocument,
  CandidatureModuleType,
  CandidatureSublist,
  DEFAULT_MOVEMENT_NAME,
  DocumentType,
  FiscalizacionChecklist,
  getDefaultPermissionsForRole,
  ListVersion,
  NotificationItem,
  PadronRecord,
  ReviewStatus,
  SeatParameters,
  SystemDirectory,
  UserInvitation,
  UserPermissions,
  UserProfile,
  UserRole,
} from '../types/electoral';
import {
  getSublistEligibilityRules,
  validateCandidateEligibility,
} from '../utils/validation';

const BOOTSTRAPPED_ADMIN_EMAIL = 'fcinmobiliariapy@gmail.com';
const PADRON_SHARD_SIZE = 1000;
const PADRON_WRITE_BATCH_SIZE = 450;

export function normalizeInviteId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export function getEffectivePermissions(user: UserProfile | null): UserPermissions {
  if (!user) return { alta: false, baja: false, modificacion: false };
  if (user.role === 'admin') return { alta: true, baja: true, modificacion: true };
  return user.permissions || getDefaultPermissionsForRole(user.role);
}

export function hasAltaPermission(user: UserProfile | null): boolean {
  if (!user || !user.active) return false;
  return getEffectivePermissions(user).alta;
}

export function hasModificacionPermission(user: UserProfile | null): boolean {
  if (!user || !user.active) return false;
  return getEffectivePermissions(user).modificacion;
}

export function hasBajaPermission(user: UserProfile | null): boolean {
  if (!user || !user.active) return false;
  return getEffectivePermissions(user).baja;
}

export interface PadronProgressInfo {
  phase: string;
  completed: number;
  total: number;
}

export interface PadronCatalogDoc {
  id?: string;
  records?: Record<string, unknown>[];
  shardIds?: string[];
  totalCount?: number;
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function sanitizeCatalogRecords(rawRecords: unknown[]): PadronRecord[] {
  const out: PadronRecord[] = [];
  for (const item of rawRecords) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.numero_ced === 'string' &&
      typeof r.cod_dpto === 'string' &&
      typeof r.codigo_sec === 'string'
    ) {
      out.push({
        cod_dpto: String(r.cod_dpto || '00'),
        desc_dep: String(r.desc_dep || 'Capital'),
        cod_dist: String(r.cod_dist || '001'),
        desc_dis: String(r.desc_dis || 'Asunción'),
        codigo_sec: String(r.codigo_sec || '1'),
        numero_ced: String(r.numero_ced),
        apellido: String(r.apellido || ''),
        nombre: String(r.nombre || ''),
        fecha_naci: String(r.fecha_naci || '1980-01-01'),
        fecha_afil: String(r.fecha_afil || '2012-09-11'),
      });
    }
  }
  return out;
}

export async function fetchPadronCatalogFromIndex(
  indexData?: PadronCatalogDoc | null
): Promise<PadronRecord[]> {
  try {
    let manifest = indexData;
    if (manifest === undefined) {
      const catSnap = await getDoc(doc(db, 'padron_catalog', 'index_v1'));
      manifest = catSnap.exists() ? (catSnap.data() as PadronCatalogDoc) : null;
    }
    if (!manifest) return [];

    const firstRecords = sanitizeCatalogRecords(
      Array.isArray(manifest.records) ? manifest.records : []
    );
    const shardIds = Array.isArray(manifest.shardIds)
      ? manifest.shardIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    if (shardIds.length === 0) {
      return firstRecords;
    }

    const allRecords: PadronRecord[] = [...firstRecords];
    for (let i = 0; i < shardIds.length; i += 10) {
      const chunkIds = shardIds.slice(i, i + 10);
      const shardSnaps = await Promise.all(
        chunkIds.map((shardId) => getDoc(doc(db, 'padron_catalog', shardId)))
      );
      for (const snap of shardSnaps) {
        if (snap.exists()) {
          const sData = snap.data() as PadronCatalogDoc;
          if (Array.isArray(sData.records)) {
            allRecords.push(...sanitizeCatalogRecords(sData.records));
          }
        }
      }
    }
    return allRecords;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'padron_catalog/index_v1');
  }
}

export async function ensureUserProfile(firebaseUser: User): Promise<UserProfile> {
  const userPath = `users/${firebaseUser.uid}`;
  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);

    let profile: UserProfile;
    if (!snap.exists()) {
      const emailStr = (firebaseUser.email || 'sin-correo@anr.org.py').trim();
      const isBootAdmin =
        emailStr.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL &&
        firebaseUser.emailVerified;

      let invitedData: UserInvitation | null = null;
      if (!isBootAdmin && firebaseUser.email) {
        try {
          const inviteSnap = await getDoc(
            doc(db, 'user_invitations', normalizeInviteId(emailStr))
          );
          if (inviteSnap.exists()) {
            const candidateInvite = inviteSnap.data() as UserInvitation;
            if (candidateInvite.email.toLowerCase() === emailStr.toLowerCase()) {
              invitedData = candidateInvite;
            }
          }
        } catch {
          // Ignore missing invitation lookup errors
        }
      }

      const assignedRole: UserRole = isBootAdmin
        ? 'admin'
        : invitedData
          ? invitedData.role
          : 'operador';
      const assignedActive = isBootAdmin
        ? true
        : invitedData
          ? invitedData.active
          : true;
      const assignedPermissions: UserPermissions = isBootAdmin
        ? getDefaultPermissionsForRole('admin')
        : invitedData
          ? invitedData.permissions
          : getDefaultPermissionsForRole('operador');

      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: emailStr,
        displayName: (
          invitedData?.displayName ||
          firebaseUser.displayName ||
          emailStr ||
          'Usuario SICCE'
        ).slice(0, 120),
        role: assignedRole,
        active: assignedActive,
        permissions: assignedPermissions,
      };
      await setDoc(userRef, {
        ...newProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      profile = newProfile;
    } else {
      const rawProfile = snap.data() as UserProfile;
      profile = {
        ...rawProfile,
        permissions: rawProfile.permissions || getDefaultPermissionsForRole(rawProfile.role),
      };
      // Sync display name if updated
      const nextName = (firebaseUser.displayName || profile.displayName).slice(0, 120);
      if (nextName !== profile.displayName) {
        await updateDoc(userRef, {
          displayName: nextName,
          updatedAt: serverTimestamp(),
        });
        profile.displayName = nextName;
      }
    }

    // Ensure staff directory includes current user
    const dirRef = doc(db, 'system_directory', 'main');
    try {
      const dirSnap = await getDoc(dirRef);
      if (!dirSnap.exists()) {
        await setDoc(dirRef, {
          id: 'main',
          staffUids: [firebaseUser.uid],
          candidatureIds: [],
          invitationIds: [],
          updatedAt: serverTimestamp(),
        });
      } else {
        const dirData = dirSnap.data() as SystemDirectory;
        if (!dirData.staffUids.includes(firebaseUser.uid) && dirData.staffUids.length < 50) {
          await updateDoc(dirRef, {
            staffUids: arrayUnion(firebaseUser.uid),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch {
      // Directory update is best-effort for staff visibility
    }

    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function getSystemDirectory(): Promise<SystemDirectory | null> {
  try {
    const snap = await getDoc(doc(db, 'system_directory', 'main'));
    return snap.exists() ? (snap.data() as SystemDirectory) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'system_directory/main');
  }
}

export async function seedInitialDataIfNeeded(actor: UserProfile): Promise<{
  seatParams: SeatParameters | null;
  padronRecords: PadronRecord[];
}> {
  let seatParams: SeatParameters | null = null;
  let padronRecords: PadronRecord[] = [];

  try {
    const seatSnap = await getDoc(doc(db, 'seat_parameters', 'anr_2027'));
    if (seatSnap.exists()) {
      const existing = seatSnap.data() as SeatParameters;
      const existingCount = Object.keys(existing.seccionalesConfig || {}).length;
      if (existingCount < 300) {
        const mergedSeccionales = {
          ...buildDefaultSeccionalesConfig(),
          ...existing.seccionalesConfig,
        };
        const upgraded: SeatParameters = {
          ...existing,
          seccionalesConfig: mergedSeccionales,
        };
        if (actor.role === 'admin') {
          await setDoc(doc(db, 'seat_parameters', 'anr_2027'), {
            ...upgraded,
            updatedByUid: actor.uid,
            updatedAt: serverTimestamp(),
          });
        }
        seatParams = upgraded;
      } else {
        seatParams = existing;
      }
    } else if (actor.role === 'admin') {
      const defaults = createDefaultSeatParameters(actor.uid);
      await setDoc(doc(db, 'seat_parameters', 'anr_2027'), {
        ...defaults,
        updatedAt: serverTimestamp(),
      });
      seatParams = defaults;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seat_parameters/anr_2027');
  }

  try {
    const catSnap = await getDoc(doc(db, 'padron_catalog', 'index_v1'));
    const catData = catSnap.exists()
      ? (catSnap.data() as PadronCatalogDoc)
      : null;
    const rawRecords = catData?.records || [];
    const isIntentionallyCleared =
      catSnap.exists() &&
      rawRecords.length === 0 &&
      catData?.totalCount === 0 &&
      (!Array.isArray(catData?.shardIds) || catData.shardIds.length === 0);
    const hasNewSchema =
      rawRecords.length > 0 &&
      typeof rawRecords[0]?.numero_ced === 'string' &&
      typeof rawRecords[0]?.cod_dpto === 'string' &&
      typeof rawRecords[0]?.codigo_sec === 'string';

    if (isIntentionallyCleared) {
      padronRecords = [];
    } else if (catSnap.exists() && hasNewSchema) {
      padronRecords = await fetchPadronCatalogFromIndex(catData);
    } else if (actor.role === 'admin') {
      const seeded = generateSeedPadronRecords(actor.uid);
      const batch = writeBatch(db);
      for (const rec of seeded) {
        batch.set(doc(db, 'padron_anr', rec.numero_ced), {
          ...rec,
          createdByUid: actor.uid,
          createdAt: serverTimestamp(),
        });
      }
      batch.set(doc(db, 'padron_catalog', 'index_v1'), {
        id: 'index_v1',
        records: seeded.map(({ createdByUid: _u, createdAt: _c, ...rest }) => rest),
        shardIds: [],
        totalCount: seeded.length,
        updatedByUid: actor.uid,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      padronRecords = seeded;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'padron_catalog/index_v1');
  }

  return { seatParams, padronRecords };
}

export async function lookupPadronByCedula(cedula: string): Promise<PadronRecord | null> {
  const clean = cedula.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clean) return null;
  try {
    const snap = await getDoc(doc(db, 'padron_anr', clean));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (typeof data.numero_ced !== 'string') return null;
    return data as unknown as PadronRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `padron_anr/${clean}`);
  }
}

function normalizePadronRecord(
  rec: Omit<PadronRecord, 'createdByUid' | 'createdAt'>
): Omit<PadronRecord, 'createdByUid' | 'createdAt'> | null {
  const cleanId = (rec.numero_ced || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
  if (!cleanId) return null;
  const fechaNaci = (rec.fecha_naci || '').trim().slice(0, 20);
  const fechaAfil = (rec.fecha_afil || '').trim().slice(0, 20);
  return {
    cod_dpto: (rec.cod_dpto || '00').trim().slice(0, 10) || '00',
    desc_dep: (rec.desc_dep || 'Capital').trim().slice(0, 60) || 'Capital',
    cod_dist: (rec.cod_dist || '001').trim().slice(0, 15) || '001',
    desc_dis: (rec.desc_dis || 'Asunción').trim().slice(0, 80) || 'Asunción',
    codigo_sec: (rec.codigo_sec || '1').trim().slice(0, 20) || '1',
    numero_ced: cleanId,
    apellido: (rec.apellido || 'Sin Apellido').trim().slice(0, 100) || 'Sin Apellido',
    nombre: (rec.nombre || 'Sin Nombre').trim().slice(0, 100) || 'Sin Nombre',
    fecha_naci: fechaNaci.length >= 4 ? fechaNaci : '1980-01-01',
    fecha_afil: fechaAfil.length >= 4 ? fechaAfil : '2012-09-11',
  };
}

function stripCatalogMeta(
  rec: PadronRecord
): Omit<PadronRecord, 'createdByUid' | 'createdAt'> {
  return {
    cod_dpto: rec.cod_dpto,
    desc_dep: rec.desc_dep,
    cod_dist: rec.cod_dist,
    desc_dis: rec.desc_dis,
    codigo_sec: rec.codigo_sec,
    numero_ced: rec.numero_ced,
    apellido: rec.apellido,
    nombre: rec.nombre,
    fecha_naci: rec.fecha_naci,
    fecha_afil: rec.fecha_afil,
  };
}

async function writeShardedPadronCatalog(
  records: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[],
  actor: UserProfile,
  authorizedUids: string[],
  auditLog: { action: string; entityId: string; summary: string },
  onProgress?: (info: PadronProgressInfo) => void
): Promise<void> {
  const cleanRecords = records.map(stripCatalogMeta);

  let previousShardIds: string[] = [];
  try {
    const prevSnap = await getDoc(doc(db, 'padron_catalog', 'index_v1'));
    if (prevSnap.exists()) {
      const prevData = prevSnap.data() as PadronCatalogDoc;
      if (Array.isArray(prevData.shardIds)) {
        previousShardIds = prevData.shardIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        );
      }
    }
  } catch {
    // Manifest might not exist yet
  }

  const firstChunk = cleanRecords.slice(0, PADRON_SHARD_SIZE);
  const extraShards: {
    shardId: string;
    chunk: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[];
  }[] = [];

  for (let i = PADRON_SHARD_SIZE, idx = 1; i < cleanRecords.length; i += PADRON_SHARD_SIZE, idx++) {
    extraShards.push({
      shardId: `shard_${String(idx).padStart(3, '0')}`,
      chunk: cleanRecords.slice(i, i + PADRON_SHARD_SIZE),
    });
  }

  const newShardIds = extraShards.map((s) => s.shardId);

  // Write extra shards FIRST so index_v1 snapshot listeners always find ready shards
  let indexedCount = Math.min(firstChunk.length, cleanRecords.length);
  for (let i = 0; i < extraShards.length; i += 4) {
    const group = extraShards.slice(i, i + 4);
    await Promise.all(
      group.map((s) =>
        setDoc(doc(db, 'padron_catalog', s.shardId), {
          id: s.shardId,
          records: s.chunk,
          shardIds: [],
          totalCount: cleanRecords.length,
          updatedByUid: actor.uid,
          updatedAt: serverTimestamp(),
        })
      )
    );
    indexedCount += group.reduce((sum, s) => sum + s.chunk.length, 0);
    onProgress?.({
      phase: 'Indexando catálogo de búsqueda',
      completed: indexedCount,
      total: cleanRecords.length,
    });
  }

  // Write manifest index_v1 + audit log atomically
  const metaBatch = writeBatch(db);
  metaBatch.set(doc(db, 'padron_catalog', 'index_v1'), {
    id: 'index_v1',
    records: firstChunk,
    shardIds: newShardIds,
    totalCount: cleanRecords.length,
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp(),
  });
  const logId = makeId('log');
  metaBatch.set(doc(db, 'audit_logs', logId), {
    id: logId,
    action: auditLog.action,
    entityType: 'PadronANR',
    entityId: auditLog.entityId,
    summary: auditLog.summary.slice(0, 400),
    actorUid: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    authorizedUids: Array.from(new Set([actor.uid, ...authorizedUids])).slice(0, 50),
    createdAt: serverTimestamp(),
  });
  await metaBatch.commit();

  // Delete obsolete shard docs if the new dataset uses fewer shards
  const newShardSet = new Set(newShardIds);
  const obsoleteShards = previousShardIds.filter(
    (id) => !newShardSet.has(id) && id !== 'index_v1'
  );
  for (let i = 0; i < obsoleteShards.length; i += 10) {
    const group = obsoleteShards.slice(i, i + 10);
    await Promise.all(
      group.map((id) =>
        deleteDoc(doc(db, 'padron_catalog', id)).catch(() => {
          // Ignore missing shard cleanup
        })
      )
    );
  }
}

export async function addPadronRecord(
  record: Omit<PadronRecord, 'createdByUid' | 'createdAt'>,
  currentCatalog: PadronRecord[],
  actor: UserProfile,
  authorizedUids: string[]
): Promise<PadronRecord[]> {
  const cleanRec = normalizePadronRecord(record);
  if (!cleanRec) {
    throw new Error('El campo numero_ced es obligatorio y debe contener caracteres válidos.');
  }
  const cleanId = cleanRec.numero_ced;
  const normalized: PadronRecord = {
    ...cleanRec,
    createdByUid: actor.uid,
  };
  try {
    await setDoc(doc(db, 'padron_anr', cleanId), {
      ...normalized,
      createdAt: serverTimestamp(),
    });
    const updatedCatalog = [
      ...currentCatalog.filter((r) => r.numero_ced !== cleanId).map(stripCatalogMeta),
      cleanRec,
    ];
    await writeShardedPadronCatalog(updatedCatalog, actor, authorizedUids, {
      action: 'ADD_PADRON_RECORD',
      entityId: cleanId,
      summary: `Registro/actualización en PadronANR para C.I. ${cleanId} (${cleanRec.nombre} ${cleanRec.apellido} · Sec. ${cleanRec.codigo_sec}).`,
    });
    return updatedCatalog;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `padron_anr/${cleanId}`);
  }
}

export async function deletePadronRecord(
  numeroCed: string,
  currentCatalog: PadronRecord[],
  actor: UserProfile,
  authorizedUids: string[]
): Promise<PadronRecord[]> {
  const cleanId = numeroCed.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) return currentCatalog;
  try {
    await deleteDoc(doc(db, 'padron_anr', cleanId));
    const updatedCatalog = currentCatalog
      .filter((r) => r.numero_ced !== cleanId)
      .map(stripCatalogMeta);
    await writeShardedPadronCatalog(updatedCatalog, actor, authorizedUids, {
      action: 'DELETE_PADRON_RECORD',
      entityId: cleanId,
      summary: `Eliminación de registro C.I. ${cleanId} de PadronANR.`,
    });
    return updatedCatalog;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `padron_anr/${cleanId}`);
  }
}

export async function importPadronBatch(
  newRecords: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[],
  currentCatalog: PadronRecord[],
  actor: UserProfile,
  authorizedUids: string[],
  onProgress?: (info: PadronProgressInfo) => void
): Promise<PadronRecord[]> {
  try {
    const mergedMap = new Map<string, Omit<PadronRecord, 'createdByUid' | 'createdAt'>>();
    for (const r of currentCatalog) {
      if (r.numero_ced) {
        mergedMap.set(r.numero_ced, stripCatalogMeta(r));
      }
    }

    const toWriteMap = new Map<string, Omit<PadronRecord, 'createdByUid' | 'createdAt'>>();
    for (const rec of newRecords) {
      const cleanRec = normalizePadronRecord(rec);
      if (!cleanRec) continue;
      mergedMap.set(cleanRec.numero_ced, cleanRec);
      toWriteMap.set(cleanRec.numero_ced, cleanRec);
    }

    const toWrite = Array.from(toWriteMap.values());
    if (toWrite.length === 0) {
      throw new Error('No se encontraron registros válidos con numero_ced para importar.');
    }

    for (let i = 0; i < toWrite.length; i += PADRON_WRITE_BATCH_SIZE) {
      const chunk = toWrite.slice(i, i + PADRON_WRITE_BATCH_SIZE);
      const writeB = writeBatch(db);
      for (const cleanRec of chunk) {
        writeB.set(doc(db, 'padron_anr', cleanRec.numero_ced), {
          ...cleanRec,
          createdByUid: actor.uid,
          createdAt: serverTimestamp(),
        });
      }
      await writeB.commit();
      onProgress?.({
        phase: 'Guardando registros en PadronANR',
        completed: Math.min(i + chunk.length, toWrite.length),
        total: toWrite.length,
      });
    }

    const updatedCatalog = Array.from(mergedMap.values());
    await writeShardedPadronCatalog(
      updatedCatalog,
      actor,
      authorizedUids,
      {
        action: 'IMPORT_PADRON_BATCH',
        entityId: 'index_v1',
        summary: `Importación de ${toWrite.length} registro(s) al PadronANR (Total indexado: ${updatedCatalog.length}).`,
      },
      onProgress
    );
    return updatedCatalog;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'padron_catalog/index_v1');
  }
}

export async function replacePadronDatabase(
  newRecords: Omit<PadronRecord, 'createdByUid' | 'createdAt'>[],
  currentCatalog: PadronRecord[],
  actor: UserProfile,
  authorizedUids: string[],
  onProgress?: (info: PadronProgressInfo) => void
): Promise<PadronRecord[]> {
  try {
    const dedupMap = new Map<string, Omit<PadronRecord, 'createdByUid' | 'createdAt'>>();
    for (const rec of newRecords) {
      const cleanRec = normalizePadronRecord(rec);
      if (!cleanRec) continue;
      dedupMap.set(cleanRec.numero_ced, cleanRec);
    }

    const nextRecords = Array.from(dedupMap.values());
    if (nextRecords.length === 0) {
      throw new Error('No se encontraron registros válidos con numero_ced para reemplazar PadronANR.');
    }

    onProgress?.({
      phase: 'Verificando registros anteriores',
      completed: 0,
      total: nextRecords.length,
    });

    const existingIds = new Set<string>(
      currentCatalog.map((r) => r.numero_ced).filter(Boolean)
    );
    if (actor.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      const snap = await getDocs(collection(db, 'padron_anr'));
      snap.docs.forEach((d) => existingIds.add(d.id));
    }

    const toDelete = Array.from(existingIds).filter((id) => !dedupMap.has(id));
    for (let i = 0; i < toDelete.length; i += PADRON_WRITE_BATCH_SIZE) {
      const delChunk = toDelete.slice(i, i + PADRON_WRITE_BATCH_SIZE);
      const delBatch = writeBatch(db);
      for (const id of delChunk) {
        delBatch.delete(doc(db, 'padron_anr', id));
      }
      await delBatch.commit();
      onProgress?.({
        phase: 'Eliminando registros obsoletos',
        completed: Math.min(i + delChunk.length, toDelete.length),
        total: toDelete.length,
      });
    }

    for (let i = 0; i < nextRecords.length; i += PADRON_WRITE_BATCH_SIZE) {
      const chunk = nextRecords.slice(i, i + PADRON_WRITE_BATCH_SIZE);
      const writeB = writeBatch(db);
      for (const cleanRec of chunk) {
        writeB.set(doc(db, 'padron_anr', cleanRec.numero_ced), {
          ...cleanRec,
          createdByUid: actor.uid,
          createdAt: serverTimestamp(),
        });
      }
      await writeB.commit();
      onProgress?.({
        phase: 'Grabando PadronANR en Firestore',
        completed: Math.min(i + chunk.length, nextRecords.length),
        total: nextRecords.length,
      });
    }

    await writeShardedPadronCatalog(
      nextRecords,
      actor,
      authorizedUids,
      {
        action: 'REPLACE_PADRON_ANR',
        entityId: 'index_v1',
        summary: `Reemplazo completo del PadronANR con ${nextRecords.length} registro(s).`,
      },
      onProgress
    );
    return nextRecords;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'padron_catalog/index_v1');
  }
}

export async function clearPadronDatabase(
  currentCatalog: PadronRecord[],
  actor: UserProfile,
  authorizedUids: string[],
  onProgress?: (info: PadronProgressInfo) => void
): Promise<PadronRecord[]> {
  try {
    const idsToDelete = new Set<string>(
      currentCatalog.map((r) => r.numero_ced).filter(Boolean)
    );
    if (actor.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      const snap = await getDocs(collection(db, 'padron_anr'));
      snap.docs.forEach((d) => idsToDelete.add(d.id));
    }

    const allIds = Array.from(idsToDelete);
    for (let i = 0; i < allIds.length; i += PADRON_WRITE_BATCH_SIZE) {
      const delChunk = allIds.slice(i, i + PADRON_WRITE_BATCH_SIZE);
      const delBatch = writeBatch(db);
      for (const id of delChunk) {
        delBatch.delete(doc(db, 'padron_anr', id));
      }
      await delBatch.commit();
      onProgress?.({
        phase: 'Limpiando registros de PadronANR',
        completed: Math.min(i + delChunk.length, allIds.length),
        total: allIds.length,
      });
    }

    await writeShardedPadronCatalog(
      [],
      actor,
      authorizedUids,
      {
        action: 'CLEAR_PADRON_ANR',
        entityId: 'index_v1',
        summary: `Limpieza total de la base de datos PadronANR (${allIds.length} registros eliminados).`,
      },
      onProgress
    );
    return [];
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'padron_catalog/index_v1');
  }
}

export async function updateSeatParameters(
  params: SeatParameters,
  actor: UserProfile,
  authorizedUids: string[]
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'seat_parameters', 'anr_2027'), {
      ...params,
      id: 'anr_2027',
      updatedByUid: actor.uid,
      updatedAt: serverTimestamp(),
    });
    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: 'UPDATE_SEAT_PARAMETERS',
      entityType: 'SeatParameters',
      entityId: 'anr_2027',
      summary: `Actualización de Parámetros de Escaños y plazos electorales por ${actor.displayName}.`,
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids: Array.from(new Set([actor.uid, ...authorizedUids])).slice(0, 50),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'seat_parameters/anr_2027');
  }
}

export async function saveCandidature(input: {
  existingCandidature?: Candidature | null;
  moduleType: CandidatureModuleType;
  title: string;
  movementName?: string;
  listNumber: string;
  departamento: string;
  seccional: string;
  sublists: CandidatureSublist[];
  changeNote: string;
  observationNote?: string;
  actor: UserProfile;
  staffUids: string[];
}): Promise<Candidature> {
  const {
    existingCandidature,
    moduleType,
    title,
    movementName,
    listNumber,
    departamento,
    seccional,
    sublists,
    changeNote,
    observationNote,
    actor,
    staffUids,
  } = input;

  const normalizedSublists: CandidatureSublist[] = sublists.map((sub) => ({
    ...sub,
    candidates: sub.candidates.map((cand) => ({
      ...cand,
      telefono: (cand.telefono || '').trim().slice(0, 30),
      observacion: (cand.observacion || '').trim().slice(0, 200),
    })),
  }));

  const isUpdate = Boolean(existingCandidature);
  const candidatureId = existingCandidature ? existingCandidature.id : makeId('cand');
  const nextVersion = existingCandidature ? existingCandidature.versionNumber + 1 : 1;
  const totalCandidates = normalizedSublists.reduce((sum, s) => sum + s.candidates.length, 0);
  const requiredCandidates = normalizedSublists.reduce((sum, s) => sum + s.requiredSeats, 0);
  const actualIsComplete =
    totalCandidates === requiredCandidates &&
    normalizedSublists.every((s) => s.candidates.length === s.requiredSeats);

  const authorizedUids = Array.from(
    new Set([actor.uid, existingCandidature?.createdByUid || actor.uid, ...staffUids])
  ).slice(0, 50);

  const normalizedList = listNumber.trim().slice(0, 20) || 'A';
  const normalizedMovement = (movementName?.trim() || DEFAULT_MOVEMENT_NAME).slice(0, 120);

  const missingSummary = normalizedSublists
    .filter((s) => s.candidates.length < s.requiredSeats)
    .map((s) => `${s.label} (${s.candidates.length}/${s.requiredSeats})`)
    .join('; ');
  const fallbackObs = missingSummary
    ? `Candidatura incompleta (${totalCandidates}/${requiredCandidates} escaños). Faltantes: ${missingSummary}.`
    : `Candidatura incompleta (${totalCandidates}/${requiredCandidates} escaños cargados).`;

  const autoAgeObsList: string[] = [];
  const autoSeccionalObsList: string[] = [];
  for (const sub of normalizedSublists) {
    const rules = getSublistEligibilityRules(moduleType, sub, departamento, seccional);
    if (
      rules.minAge !== undefined ||
      rules.requiredSeccional !== undefined ||
      rules.requiredSeccionalCode != null
    ) {
      for (const cand of sub.candidates) {
        const elig = validateCandidateEligibility(cand, rules);
        if (elig.ageErrors.length > 0) {
          autoAgeObsList.push(...elig.ageErrors);
        }
        if (elig.seccionalErrors.length > 0) {
          autoSeccionalObsList.push(...elig.seccionalErrors);
        }
      }
    }
  }

  const hasAgeObservations = autoAgeObsList.length > 0;
  const hasSeccionalObservations = autoSeccionalObsList.length > 0;
  const isObserved = !actualIsComplete || hasAgeObservations || hasSeccionalObservations;
  const autoObsAll = [...autoAgeObsList, ...autoSeccionalObsList];
  const autoParts: string[] = [];
  if (autoObsAll.length > 0) autoParts.push(autoObsAll.join(' '));
  if (!actualIsComplete) autoParts.push(fallbackObs);
  const autoCombinedObs = autoParts.join(' | ');

  const trimmedNote = observationNote ? observationNote.trim() : '';
  const needsAutoPrefix =
    (hasAgeObservations && !trimmedNote.includes('Observación de edad:')) ||
    (hasSeccionalObservations && !trimmedNote.includes('Observación de seccional:'));
  const finalObservation = (
    trimmedNote.length >= 3
      ? needsAutoPrefix && autoObsAll.length > 0
        ? `${autoObsAll.join(' ')} | ${trimmedNote}`
        : trimmedNote
      : autoCombinedObs
  ).slice(0, 500);

  const finalReviewStatus: ReviewStatus = isObserved ? 'OBSERVADA' : 'PENDIENTE';
  const finalReviewComment = isObserved ? finalObservation : '';

  const candidaturePayload: Candidature = {
    id: candidatureId,
    moduleType,
    title: title.trim().slice(0, 180),
    movementName: normalizedMovement,
    listNumber: normalizedList,
    departamento: departamento.slice(0, 60),
    seccional: seccional.slice(0, 80),
    sublists: normalizedSublists,
    totalCandidates,
    requiredCandidates,
    isComplete: actualIsComplete,
    reviewStatus: finalReviewStatus,
    reviewComment: finalReviewComment,
    reviewedByUid: existingCandidature ? existingCandidature.reviewedByUid : '',
    versionNumber: nextVersion,
    ...(existingCandidature?.fiscalizacion
      ? { fiscalizacion: existingCandidature.fiscalizacion }
      : {}),
    createdByUid: existingCandidature ? existingCandidature.createdByUid : actor.uid,
    createdByName: existingCandidature ? existingCandidature.createdByName : actor.displayName,
    authorizedUids,
  };

  try {
    const batch = writeBatch(db);
    const candRef = doc(db, 'candidatures', candidatureId);

    if (isUpdate && existingCandidature) {
      batch.update(candRef, {
        title: candidaturePayload.title,
        movementName: candidaturePayload.movementName,
        listNumber: candidaturePayload.listNumber,
        departamento: candidaturePayload.departamento,
        seccional: candidaturePayload.seccional,
        sublists: candidaturePayload.sublists,
        totalCandidates: candidaturePayload.totalCandidates,
        requiredCandidates: candidaturePayload.requiredCandidates,
        isComplete: actualIsComplete,
        reviewStatus: finalReviewStatus,
        reviewComment: finalReviewComment,
        versionNumber: nextVersion,
        authorizedUids,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(candRef, {
        ...candidaturePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Create immutable version snapshot
    const versionId = makeId('ver');
    batch.set(doc(db, 'list_versions', versionId), {
      id: versionId,
      candidatureId,
      moduleType,
      title: candidaturePayload.title,
      versionNumber: nextVersion,
      changeNote:
        changeNote.trim().slice(0, 300) ||
        (!isObserved
          ? isUpdate
            ? 'Actualización de lista completa'
            : 'Carga inicial oficial completa'
          : !actualIsComplete
            ? `Carga incompleta con observaciones (${totalCandidates}/${requiredCandidates})`
            : 'Carga completa en estado OBSERVADA por validación automática'),
      snapshotSublists: normalizedSublists,
      totalCandidates,
      createdByUid: actor.uid,
      createdByName: actor.displayName,
      authorizedUids,
      createdAt: serverTimestamp(),
    });

    // Create immutable audit log
    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: isUpdate ? 'UPDATE_CANDIDATURE' : 'CREATE_CANDIDATURE',
      entityType: 'Candidature',
      entityId: candidatureId,
      summary: `${isUpdate ? 'Actualización' : 'Registro'} v${nextVersion} de "${candidaturePayload.title}" (${candidaturePayload.movementName} · Lista ${candidaturePayload.listNumber}) con ${totalCandidates}/${requiredCandidates} candidatos${!isObserved ? '' : !actualIsComplete ? ' [INCOMPLETA - CON OBSERVACIONES]' : ' [OBSERVADA - VALIDACIÓN AUTOMÁTICA]'}.`.slice(
        0,
        400
      ),
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids,
      createdAt: serverTimestamp(),
    });

    // Create in-system confirmation notification
    const notifId = makeId('notif');
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      targetUid: actor.uid,
      title: (
        !isObserved
          ? isUpdate
            ? 'Candidatura actualizada'
            : 'Candidatura registrada con éxito'
          : !actualIsComplete
            ? 'Candidatura incompleta guardada con observaciones'
            : 'Candidatura guardada en estado OBSERVADA'
      ).slice(0, 140),
      message: (
        !isObserved
          ? `Se confirmó la lista "${candidaturePayload.title}" (v${nextVersion}) con ${totalCandidates}/${requiredCandidates} escaños completos.`
          : `Se grabó la lista "${candidaturePayload.title}" (v${nextVersion}) en estado OBSERVADA con ${totalCandidates}/${requiredCandidates} escaños: ${finalReviewComment}`
      ).slice(0, 400),
      category: !isObserved ? 'CONFIRMACION' : 'REVISION',
      read: false,
      createdAt: serverTimestamp(),
    });

    // Update or create directory safely
    const dirRef = doc(db, 'system_directory', 'main');
    const dirSnap = await getDoc(dirRef);
    if (dirSnap.exists()) {
      batch.update(dirRef, {
        candidatureIds: arrayUnion(candidatureId),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(dirRef, {
        id: 'main',
        staffUids: Array.from(new Set([actor.uid, ...staffUids])).slice(0, 50),
        candidatureIds: [candidatureId],
        invitationIds: [],
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return candidaturePayload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `candidatures/${candidatureId}`);
  }
}

export async function reviewCandidature(
  candidature: Candidature,
  newStatus: ReviewStatus,
  reviewComment: string,
  actor: UserProfile,
  staffUids: string[]
): Promise<void> {
  if (!candidature.isComplete && newStatus !== 'OBSERVADA') {
    throw new Error(
      'Las candidaturas incompletas deben permanecer en estado OBSERVADA hasta completar todos los escaños.'
    );
  }
  const normalizedComment = reviewComment.trim().slice(0, 500);
  if (!candidature.isComplete && normalizedComment.length < 3) {
    throw new Error('Ingrese una observación de al menos 3 caracteres para la candidatura incompleta.');
  }

  const authorizedUids = Array.from(
    new Set([actor.uid, candidature.createdByUid, ...staffUids])
  ).slice(0, 50);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'candidatures', candidature.id), {
      reviewStatus: newStatus,
      reviewComment: normalizedComment,
      reviewedByUid: actor.uid,
      updatedAt: serverTimestamp(),
    });

    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action:
        newStatus === 'APROBADA'
          ? 'APPROVE_CANDIDATURE'
          : newStatus === 'OBSERVADA'
            ? 'OBSERVE_CANDIDATURE'
            : 'REVIEW_RESET',
      entityType: 'Candidature',
      entityId: candidature.id,
      summary: `Revisión de "${candidature.title}" cambiada a ${newStatus}${normalizedComment ? `: ${normalizedComment}` : ''}.`.slice(
        0,
        400
      ),
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids,
      createdAt: serverTimestamp(),
    });

    const notifId = makeId('notif');
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      targetUid: candidature.createdByUid,
      title: `Lista ${newStatus}: ${candidature.title}`.slice(0, 140),
      message: (normalizedComment
        ? `El revisor ${actor.displayName} marcó la lista como ${newStatus}. Observación: ${normalizedComment}`
        : `El revisor ${actor.displayName} cambió el estado de la lista a ${newStatus}.`
      ).slice(0, 400),
      category: 'REVISION',
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `candidatures/${candidature.id}`);
  }
}

export async function deleteCandidature(
  candidature: Candidature,
  actor: UserProfile,
  staffUids: string[]
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'candidatures', candidature.id));
    const logId = makeId('log');
    await setDoc(doc(db, 'audit_logs', logId), {
      id: logId,
      action: 'DELETE_CANDIDATURE',
      entityType: 'Candidature',
      entityId: candidature.id,
      summary: `Eliminación de candidatura "${candidature.title}" (${candidature.movementName}) por administrador.`,
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids: Array.from(new Set([actor.uid, ...staffUids])).slice(0, 50),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `candidatures/${candidature.id}`);
  }
}

export async function uploadCandidatureDocument(input: {
  candidature: Candidature;
  docType: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  actor: UserProfile;
  staffUids: string[];
}): Promise<CandidatureDocument> {
  const { candidature, docType, fileName, mimeType, sizeBytes, dataUrl, actor, staffUids } = input;
  const docId = makeId('doc');
  const authorizedUids = Array.from(
    new Set([actor.uid, candidature.createdByUid, ...staffUids])
  ).slice(0, 50);

  const payload: CandidatureDocument = {
    id: docId,
    candidatureId: candidature.id,
    docType,
    fileName: fileName.slice(0, 160),
    mimeType: mimeType.slice(0, 80),
    sizeBytes,
    dataUrl,
    uploadedByUid: actor.uid,
    uploadedByName: actor.displayName,
    authorizedUids,
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'candidatures', candidature.id, 'documents', docId), {
      ...payload,
      createdAt: serverTimestamp(),
    });

    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: 'UPLOAD_DOCUMENT',
      entityType: 'CandidatureDocument',
      entityId: docId,
      summary: `Documento adjunto "${payload.fileName}" (${docType}) en "${candidature.title}".`,
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `candidatures/${candidature.id}/documents/${docId}`);
  }
}

function timestampSeconds(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) || 0;
  }
  return 0;
}

export async function fetchCandidatureDocuments(
  candidatureId: string,
  uid: string,
  isBootstrappedAdmin: boolean
): Promise<CandidatureDocument[]> {
  try {
    const colRef = collection(db, 'candidatures', candidatureId, 'documents');
    const q = isBootstrappedAdmin
      ? query(colRef)
      : query(colRef, where('authorizedUids', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as CandidatureDocument)
      .sort((a, b) => timestampSeconds(b.createdAt) - timestampSeconds(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `candidatures/${candidatureId}/documents`);
  }
}

export async function removeCandidatureDocument(
  candidatureId: string,
  docId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'candidatures', candidatureId, 'documents', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `candidatures/${candidatureId}/documents/${docId}`);
  }
}

export async function fetchAllStaffProfiles(
  directory: SystemDirectory | null,
  currentUser: UserProfile
): Promise<UserProfile[]> {
  try {
    let rawUsers: UserProfile[] = [];
    if (currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      const snap = await getDocs(collection(db, 'users'));
      rawUsers = snap.docs.map((d) => d.data() as UserProfile);
    } else {
      const uids = directory?.staffUids || [currentUser.uid];
      for (const uid of uids) {
        try {
          const s = await getDoc(doc(db, 'users', uid));
          if (s.exists()) rawUsers.push(s.data() as UserProfile);
        } catch {
          // Ignore inaccessible records
        }
      }
    }
    return rawUsers.map((u) => ({
      ...u,
      permissions: u.permissions || getDefaultPermissionsForRole(u.role),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function fetchAllUserInvitations(
  directory: SystemDirectory | null,
  currentUser: UserProfile
): Promise<UserInvitation[]> {
  try {
    if (currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      const snap = await getDocs(collection(db, 'user_invitations'));
      return snap.docs.map((d) => d.data() as UserInvitation);
    }
    const ids = directory?.invitationIds || [];
    const results: UserInvitation[] = [];
    for (const id of ids) {
      try {
        const s = await getDoc(doc(db, 'user_invitations', id));
        if (s.exists()) results.push(s.data() as UserInvitation);
      } catch {
        // Ignore deleted/inaccessible invitations
      }
    }
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'user_invitations');
  }
}

export async function createOrUpdateUserInvitation(
  input: {
    email: string;
    displayName: string;
    role: UserRole;
    permissions: UserPermissions;
    active: boolean;
  },
  actor: UserProfile,
  staffUids: string[]
): Promise<UserInvitation> {
  const cleanEmail = input.email.trim().toLowerCase().slice(0, 160);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Ingrese un correo electrónico institucional válido.');
  }
  const cleanName = input.displayName.trim().slice(0, 120) || cleanEmail;
  const inviteId = normalizeInviteId(cleanEmail);
  const effectivePermissions: UserPermissions =
    input.role === 'admin'
      ? { alta: true, baja: true, modificacion: true }
      : {
          alta: Boolean(input.permissions.alta),
          baja: Boolean(input.permissions.baja),
          modificacion: Boolean(input.permissions.modificacion),
        };

  try {
    const inviteRef = doc(db, 'user_invitations', inviteId);
    const existingSnap = await getDoc(inviteRef);
    const batch = writeBatch(db);

    if (existingSnap.exists()) {
      batch.update(inviteRef, {
        email: cleanEmail,
        displayName: cleanName,
        role: input.role,
        permissions: effectivePermissions,
        active: input.active,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(inviteRef, {
        id: inviteId,
        email: cleanEmail,
        displayName: cleanName,
        role: input.role,
        permissions: effectivePermissions,
        active: input.active,
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const dirRef = doc(db, 'system_directory', 'main');
    const dirSnap = await getDoc(dirRef);
    if (dirSnap.exists()) {
      batch.update(dirRef, {
        invitationIds: arrayUnion(inviteId),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(dirRef, {
        id: 'main',
        staffUids: Array.from(new Set([actor.uid, ...staffUids])).slice(0, 50),
        candidatureIds: [],
        invitationIds: [inviteId],
        updatedAt: serverTimestamp(),
      });
    }

    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: existingSnap.exists() ? 'UPDATE_USER_INVITATION' : 'CREATE_USER_INVITATION',
      entityType: 'UserInvitation',
      entityId: inviteId,
      summary: `${existingSnap.exists() ? 'Actualización' : 'Alta'} de usuario pre-autorizado ${cleanName} (${cleanEmail}) · Rol: ${input.role} · Permisos [Alta:${effectivePermissions.alta ? 'Sí' : 'No'}, Mod:${effectivePermissions.modificacion ? 'Sí' : 'No'}, Baja:${effectivePermissions.baja ? 'Sí' : 'No'}].`.slice(
        0,
        400
      ),
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids: Array.from(new Set([actor.uid, ...staffUids])).slice(0, 50),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return {
      id: inviteId,
      email: cleanEmail,
      displayName: cleanName,
      role: input.role,
      permissions: effectivePermissions,
      active: input.active,
      createdByUid: actor.uid,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `user_invitations/${inviteId}`);
  }
}

export async function deleteUserInvitation(
  inviteId: string,
  email: string,
  actor: UserProfile,
  staffUids: string[]
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'user_invitations', inviteId));
    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: 'DELETE_USER_INVITATION',
      entityType: 'UserInvitation',
      entityId: inviteId,
      summary: `Baja de usuario pre-autorizado (${email}).`.slice(0, 400),
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids: Array.from(new Set([actor.uid, ...staffUids])).slice(0, 50),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `user_invitations/${inviteId}`);
  }
}

export async function updateUserRoleAndStatus(
  targetUser: UserProfile,
  newRole: UserRole,
  active: boolean,
  actor: UserProfile,
  staffUids: string[],
  permissions?: UserPermissions,
  displayName?: string
): Promise<void> {
  const effectivePermissions: UserPermissions =
    newRole === 'admin'
      ? { alta: true, baja: true, modificacion: true }
      : permissions || targetUser.permissions || getDefaultPermissionsForRole(newRole);
  const nextDisplayName = (displayName?.trim() || targetUser.displayName).slice(0, 120);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', targetUser.uid), {
      displayName: nextDisplayName,
      role: newRole,
      active,
      permissions: effectivePermissions,
      updatedAt: serverTimestamp(),
    });
    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: 'UPDATE_USER_ROLE',
      entityType: 'UserProfile',
      entityId: targetUser.uid,
      summary: `Modificación de usuario ${nextDisplayName} (${targetUser.email}): rol "${newRole}", ${active ? 'Activo' : 'Suspendido'}, permisos [Alta:${effectivePermissions.alta ? 'Sí' : 'No'}, Mod:${effectivePermissions.modificacion ? 'Sí' : 'No'}, Baja:${effectivePermissions.baja ? 'Sí' : 'No'}].`.slice(
        0,
        400
      ),
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids: Array.from(new Set([actor.uid, ...staffUids])).slice(0, 50),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function deleteUserAccount(
  targetUser: UserProfile,
  actor: UserProfile,
  staffUids: string[]
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', targetUser.uid));
    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: 'DELETE_USER_ACCOUNT',
      entityType: 'UserProfile',
      entityId: targetUser.uid,
      summary: `Baja definitiva de usuario ${targetUser.displayName} (${targetUser.email}).`.slice(
        0,
        400
      ),
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids: Array.from(new Set([actor.uid, ...staffUids])).slice(0, 50),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${targetUser.uid}`);
  }
}

export async function markNotificationRead(notif: NotificationItem): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notif.id), {
      read: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notif.id}`);
  }
}

export async function fetchAllCandidaturesViaDirectory(
  directory: SystemDirectory | null
): Promise<Candidature[]> {
  if (!directory || directory.candidatureIds.length === 0) return [];
  const list: Candidature[] = [];
  for (const id of directory.candidatureIds) {
    try {
      const s = await getDoc(doc(db, 'candidatures', id));
      if (s.exists()) list.push(s.data() as Candidature);
    } catch {
      // Skip deleted/inaccessible
    }
  }
  return list.sort((a, b) => timestampSeconds(b.updatedAt) - timestampSeconds(a.updatedAt));
}

export async function fetchListVersionsByCandidatures(
  uid: string,
  isBootAdmin: boolean
): Promise<ListVersion[]> {
  try {
    const colRef = collection(db, 'list_versions');
    const q = isBootAdmin
      ? query(colRef)
      : query(colRef, where('authorizedUids', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as ListVersion)
      .sort((a, b) => timestampSeconds(b.createdAt) - timestampSeconds(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'list_versions');
  }
}

export async function fetchAuditLogs(
  uid: string,
  isBootAdmin: boolean
): Promise<AuditLog[]> {
  try {
    const colRef = collection(db, 'audit_logs');
    const q = isBootAdmin
      ? query(colRef)
      : query(colRef, where('authorizedUids', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as AuditLog)
      .sort((a, b) => timestampSeconds(b.createdAt) - timestampSeconds(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'audit_logs');
  }
}

export type FiscalizacionBooleanKey =
  | 'pagoAportePartidario'
  | 'fotocopiaCedula'
  | 'fotoCarnet3x4'
  | 'aceptacionesTriplicado'
  | 'autenticacionAceptaciones';

export interface TribunalDocRequirement {
  key: FiscalizacionBooleanKey;
  docType: DocumentType;
  label: string;
  description: string;
  onlyUnipersonal: boolean;
}

export const TRIBUNAL_DOC_REQUIREMENTS: TribunalDocRequirement[] = [
  {
    key: 'pagoAportePartidario',
    docType: 'PAGO_APORTE_PARTIDARIO',
    label: 'Pago de Aporte Partidario',
    description: 'Comprobante oficial de pago de aporte partidario ante la tesorería ANR.',
    onlyUnipersonal: false,
  },
  {
    key: 'fotocopiaCedula',
    docType: 'CEDULA_IDENTIDAD',
    label: 'Fotocopia de Cédula',
    description: 'Fotocopia legible de Cédula de Identidad Civil vigente de los postulantes.',
    onlyUnipersonal: false,
  },
  {
    key: 'fotoCarnet3x4',
    docType: 'FOTO_CARNET_3X4',
    label: 'Foto tipo carnet 3x4 (Candidaturas Unipersonales)',
    description:
      'Fotografía tipo carnet 3x4 cm obligatoria para candidaturas unipersonales (Presidente/Vice, Gobernador, Presidente ANR, Presidente de Seccional).',
    onlyUnipersonal: true,
  },
  {
    key: 'aceptacionesTriplicado',
    docType: 'ACEPTACION_TRIPLICADO',
    label: 'Aceptaciones de Candidaturas en Triplicado',
    description: 'Formularios originales de aceptación de candidatura firmados en triplicado.',
    onlyUnipersonal: false,
  },
  {
    key: 'autenticacionAceptaciones',
    docType: 'AUTENTICACION_ACEPTACION',
    label: 'Autenticación / Certificación de Aceptaciones de Candidaturas',
    description: 'Certificación o autenticación oficial de firmas de aceptación ante escribano o autoridad partidaria.',
    onlyUnipersonal: false,
  },
];

export interface FiscalizacionItemStatus extends TribunalDocRequirement {
  required: boolean;
  checked: boolean;
  attachedDocs: CandidatureDocument[];
  fulfilled: boolean;
}

export interface FiscalizacionEvaluation {
  hasUnipersonal: boolean;
  checklist: FiscalizacionChecklist;
  items: FiscalizacionItemStatus[];
  requiredCount: number;
  fulfilledCount: number;
  allDocsFulfilled: boolean;
  presentacionCompleta: boolean;
}

export function normalizeFiscalizacionChecklist(
  raw?: FiscalizacionChecklist | null
): FiscalizacionChecklist {
  return {
    pagoAportePartidario: Boolean(raw?.pagoAportePartidario),
    fotocopiaCedula: Boolean(raw?.fotocopiaCedula),
    fotoCarnet3x4: Boolean(raw?.fotoCarnet3x4),
    aceptacionesTriplicado: Boolean(raw?.aceptacionesTriplicado),
    autenticacionAceptaciones: Boolean(raw?.autenticacionAceptaciones),
    observaciones: raw?.observaciones || '',
    fiscalizadoPorUid: raw?.fiscalizadoPorUid || '',
    fiscalizadoPorName: raw?.fiscalizadoPorName || '',
    updatedAtIso: raw?.updatedAtIso || '',
  };
}

export function evaluateFiscalizacion(
  candidature: Candidature,
  docs: CandidatureDocument[] = [],
  overrideChecklist?: FiscalizacionChecklist
): FiscalizacionEvaluation {
  const hasUnipersonal = candidature.sublists.some((s) => s.tipo === 'UNIPERSONAL');
  const checklist = normalizeFiscalizacionChecklist(
    overrideChecklist || candidature.fiscalizacion
  );

  const items: FiscalizacionItemStatus[] = TRIBUNAL_DOC_REQUIREMENTS.map((req) => {
    const required = !req.onlyUnipersonal || hasUnipersonal;
    const checked = Boolean(checklist[req.key]);
    const attachedDocs = docs.filter((d) => d.docType === req.docType);
    const fulfilled = checked || attachedDocs.length > 0;
    return {
      ...req,
      required,
      checked,
      attachedDocs,
      fulfilled,
    };
  });

  const requiredItems = items.filter((i) => i.required);
  const fulfilledCount = requiredItems.filter((i) => i.fulfilled).length;
  const requiredCount = requiredItems.length;
  const allDocsFulfilled = requiredItems.every((i) => i.fulfilled);
  const presentacionCompleta = candidature.isComplete && allDocsFulfilled;

  return {
    hasUnipersonal,
    checklist,
    items,
    requiredCount,
    fulfilledCount,
    allDocsFulfilled,
    presentacionCompleta,
  };
}

export async function saveCandidatureFiscalizacion(
  candidature: Candidature,
  checklistInput: FiscalizacionChecklist,
  actor: UserProfile,
  staffUids: string[]
): Promise<FiscalizacionChecklist> {
  const payload: FiscalizacionChecklist = {
    pagoAportePartidario: Boolean(checklistInput.pagoAportePartidario),
    fotocopiaCedula: Boolean(checklistInput.fotocopiaCedula),
    fotoCarnet3x4: Boolean(checklistInput.fotoCarnet3x4),
    aceptacionesTriplicado: Boolean(checklistInput.aceptacionesTriplicado),
    autenticacionAceptaciones: Boolean(checklistInput.autenticacionAceptaciones),
    observaciones: (checklistInput.observaciones || '').trim().slice(0, 400),
    fiscalizadoPorUid: actor.uid,
    fiscalizadoPorName: actor.displayName,
    updatedAtIso: new Date().toISOString(),
  };

  const authorizedUids = Array.from(
    new Set([actor.uid, candidature.createdByUid, ...staffUids])
  ).slice(0, 50);

  const evalRes = evaluateFiscalizacion(candidature, [], payload);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'candidatures', candidature.id), {
      fiscalizacion: payload,
      updatedAt: serverTimestamp(),
    });

    const logId = makeId('log');
    batch.set(doc(db, 'audit_logs', logId), {
      id: logId,
      action: 'UPDATE_FISCALIZACION',
      entityType: 'Candidature',
      entityId: candidature.id,
      summary: `Fiscalización Tribunal de "${candidature.title}": ${evalRes.fulfilledCount}/${evalRes.requiredCount} requisitos cumplidos (${evalRes.presentacionCompleta ? 'Presentación Completa' : 'Pendiente'}).`.slice(
        0,
        400
      ),
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      authorizedUids,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `candidatures/${candidature.id}`);
  }
}
