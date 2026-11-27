import { PadronRecord, SeatParameters, SeccionalSeatConfig } from '../types/electoral';
import { SECCIONALES_ANR_2026 } from './seccionalesCatalog';

export const DEPARTAMENTOS_CON_CAPITAL: string[] = [
  'Capital',
  'Concepción',
  'San Pedro',
  'Cordillera',
  'Guairá',
  'Caaguazú',
  'Caazapá',
  'Itapúa',
  'Misiones',
  'Paraguarí',
  'Alto Paraná',
  'Central',
  'Ñeembucú',
  'Amambay',
  'Canindeyú',
  'Presidente Hayes',
  'Boquerón',
  'Alto Paraguay',
];

export const DEPARTAMENTOS_SIN_CAPITAL: string[] = DEPARTAMENTOS_CON_CAPITAL.filter(
  (d) => d !== 'Capital'
);

export const LISTA_OPTIONS = ['A', 'B', 'C', 'D'] as const;

export function buildDefaultSeccionalesConfig(): Record<string, SeccionalSeatConfig> {
  const map: Record<string, SeccionalSeatConfig> = {};
  for (const item of SECCIONALES_ANR_2026) {
    const isMajor =
      item.departamento === 'Capital' ||
      item.departamento === 'Central' ||
      item.departamento === 'Alto Paraná';
    map[item.id] = {
      id: item.id,
      codDepto: item.codDepto,
      nroSeccional: item.nroSeccional,
      nombre: item.nombre,
      departamento: item.departamento,
      distrito: item.distrito,
      miembrosTitulares: isMajor ? 12 : 10,
      miembrosSuplentes: isMajor ? 12 : 10,
      convencionalesTitulares: isMajor ? 6 : 4,
      convencionalesSuplentes: isMajor ? 6 : 4,
    };
  }
  return map;
}

export const DEFAULT_SECCIONALES: Record<string, SeccionalSeatConfig> =
  buildDefaultSeccionalesConfig();

export function createDefaultSeatParameters(updatedByUid: string): SeatParameters {
  return {
    id: 'anr_2027',
    deadlineNacional: '2027-03-15',
    deadlineAnr: '2027-02-28',
    deadlineSeccional: '2027-02-15',
    senadoresTitulares: 45,
    senadoresSuplentes: 30,
    juntaGobNacionalTitulares: 45,
    juntaGobNacionalSuplentes: 30,
    diputadosByDept: {
      Capital: { titulares: 7, suplentes: 7 },
      Concepción: { titulares: 3, suplentes: 3 },
      'San Pedro': { titulares: 5, suplentes: 5 },
      Cordillera: { titulares: 4, suplentes: 4 },
      Guairá: { titulares: 3, suplentes: 3 },
      Caaguazú: { titulares: 6, suplentes: 6 },
      Caazapá: { titulares: 2, suplentes: 2 },
      Itapúa: { titulares: 6, suplentes: 6 },
      Misiones: { titulares: 2, suplentes: 2 },
      Paraguarí: { titulares: 3, suplentes: 3 },
      'Alto Paraná': { titulares: 8, suplentes: 8 },
      Central: { titulares: 20, suplentes: 20 },
      Ñeembucú: { titulares: 2, suplentes: 2 },
      Amambay: { titulares: 2, suplentes: 2 },
      Canindeyú: { titulares: 2, suplentes: 2 },
      'Presidente Hayes': { titulares: 2, suplentes: 2 },
      Boquerón: { titulares: 1, suplentes: 1 },
      'Alto Paraguay': { titulares: 1, suplentes: 1 },
    },
    juntaDeptByDept: {
      Concepción: { titulares: 16, suplentes: 16 },
      'San Pedro': { titulares: 16, suplentes: 16 },
      Cordillera: { titulares: 14, suplentes: 14 },
      Guairá: { titulares: 12, suplentes: 12 },
      Caaguazú: { titulares: 18, suplentes: 18 },
      Caazapá: { titulares: 10, suplentes: 10 },
      Itapúa: { titulares: 21, suplentes: 21 },
      Misiones: { titulares: 10, suplentes: 10 },
      Paraguarí: { titulares: 14, suplentes: 14 },
      'Alto Paraná': { titulares: 21, suplentes: 21 },
      Central: { titulares: 21, suplentes: 21 },
      Ñeembucú: { titulares: 10, suplentes: 10 },
      Amambay: { titulares: 10, suplentes: 10 },
      Canindeyú: { titulares: 12, suplentes: 12 },
      'Presidente Hayes': { titulares: 10, suplentes: 10 },
      Boquerón: { titulares: 9, suplentes: 9 },
      'Alto Paraguay': { titulares: 9, suplentes: 9 },
    },
    juntaGobRegionalByDept: {
      Capital: { titulares: 3, suplentes: 3 },
      Concepción: { titulares: 2, suplentes: 2 },
      'San Pedro': { titulares: 2, suplentes: 2 },
      Cordillera: { titulares: 2, suplentes: 2 },
      Guairá: { titulares: 2, suplentes: 2 },
      Caaguazú: { titulares: 2, suplentes: 2 },
      Caazapá: { titulares: 1, suplentes: 1 },
      Itapúa: { titulares: 2, suplentes: 2 },
      Misiones: { titulares: 1, suplentes: 1 },
      Paraguarí: { titulares: 2, suplentes: 2 },
      'Alto Paraná': { titulares: 3, suplentes: 3 },
      Central: { titulares: 4, suplentes: 4 },
      Ñeembucú: { titulares: 1, suplentes: 1 },
      Amambay: { titulares: 1, suplentes: 1 },
      Canindeyú: { titulares: 1, suplentes: 1 },
      'Presidente Hayes': { titulares: 1, suplentes: 1 },
      Boquerón: { titulares: 1, suplentes: 1 },
      'Alto Paraguay': { titulares: 1, suplentes: 1 },
    },
    seccionalesConfig: buildDefaultSeccionalesConfig(),
    updatedByUid,
  };
}

const NOMBRES_M = [
  'Carlos Alberto', 'Juan José', 'Luis Fernando', 'Derlis Ramón', 'Óscar Rubén',
  'Gustavo Adolfo', 'Pedro Pablo', 'Arnaldo Andrés', 'César Augusto', 'Raúl Ignacio',
  'Martín Alejandro', 'Héctor Fabián', 'Jorge Daniel', 'Víctor Hugo', 'Marcos Antonio',
  'Diego Armando', 'Rodrigo Javier', 'Sebastián Emilio', 'Julio César', 'Edgar Enrique',
  'Silvio Darío', 'Roberto Carlos', 'Hugo Marcelo', 'Eduardo Ramón', 'Francisco Javier',
];

const NOMBRES_F = [
  'María Eugenia', 'Carmen Beatriz', 'Lilian Rossana', 'Sandra Paola', 'Norma Graciela',
  'Patricia Raquel', 'Claudia Lorena', 'Rosaura Isabel', 'Verónica Celeste', 'Marta Alicia',
  'Silvia Carolina', 'Blanca Rosa', 'Fátima Concepción', 'Gloria Estela', 'Zulma Beatriz',
  'Nadia Soledad', 'Mónica Viviana', 'Teresa de Jesús', 'Ana Gabriela', 'Liz Fabiola',
  'Cynthia Pamela', 'Mirian Elizabeth', 'Sonia Mabel', 'Clara Inés', 'Ruth Valeria',
];

const APELLIDOS = [
  'González Benítez', 'Martínez López', 'Gómez Duarte', 'Ramírez Cáceres', 'Villasboa Acosta',
  'Báez Pereira', 'Samaniego Ortiz', 'Alliana Rodríguez', 'Núñez Galeano', 'Ovelar Ayala',
  'Zacarías Irún', 'Britez Caballero', 'Fernández Vera', 'Rojas Giménez', 'Maidana Franco',
  'Villalba Torales', 'Paredes Sosa', 'Salinas Ferreira', 'Fleitas Mendoza', 'Riquelme Torres',
  'Bogado Medina', 'Lugo Insfrán', 'Meza Valenzuela', 'Morínigo Silva', 'Escobar Barrios',
  'Alvarenga Núñez', 'Espínola Coronel', 'Portillo Benítez', 'Cuevas Ramírez', 'Arellano Díaz',
];

export function generateSeedPadronRecords(createdByUid: string): PadronRecord[] {
  const records: PadronRecord[] = [];
  const totalToGenerate = 180;

  // Deterministic district code index per department + district name
  const distCodeByKey = new Map<string, string>();
  const deptDistCount = new Map<string, number>();
  for (const sec of SECCIONALES_ANR_2026) {
    const key = `${sec.codDepto}::${sec.distrito}`;
    if (!distCodeByKey.has(key)) {
      const nextNum = (deptDistCount.get(sec.codDepto) || 0) + 1;
      deptDistCount.set(sec.codDepto, nextNum);
      distCodeByKey.set(key, String(nextNum).padStart(3, '0'));
    }
  }

  for (let i = 0; i < totalToGenerate; i++) {
    const secChoice = SECCIONALES_ANR_2026[(i * 3) % SECCIONALES_ANR_2026.length];
    const isFemale = i % 2 === 1;
    const nombre = isFemale
      ? NOMBRES_F[i % NOMBRES_F.length]
      : NOMBRES_M[i % NOMBRES_M.length];
    const apellido = APELLIDOS[(i * 7) % APELLIDOS.length];
    const cedulaNum = 1420000 + i * 19371;
    const numero_ced = String(cedulaNum);
    const birthYear = 1962 + (i % 34);
    const birthMonth = String((i % 12) + 1).padStart(2, '0');
    const birthDay = String(((i * 3) % 28) + 1).padStart(2, '0');
    const afilYear = 1995 + (i % 28);
    const cod_dist = distCodeByKey.get(`${secChoice.codDepto}::${secChoice.distrito}`) || '001';

    records.push({
      cod_dpto: secChoice.codDepto,
      desc_dep: secChoice.departamento,
      cod_dist,
      desc_dis: secChoice.distrito,
      codigo_sec: secChoice.nroSeccional,
      numero_ced,
      apellido,
      nombre,
      fecha_naci: `${birthYear}-${birthMonth}-${birthDay}`,
      fecha_afil: `${afilYear}-${birthMonth}-11`,
      createdByUid,
    });
  }

  return records;
}
