// Synthetic outpatient appointments for a fictional IPS ("Clínica Ejemplo"), modeled on the Colombian
// RIPS consultation structure plus typical scheduling fields. No real patient data: every value is generated.
// Usage: node gen_data.js  -> data/citas.csv, data/citas.json, data/manana.json
const fs = require('fs');
const path = require('path');

// Deterministic RNG so the dataset (and the dashboard numbers) never change between runs.
let seed = 20261029;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const wpick = (pairs) => { const t = pairs.reduce((a, p) => a + p[1], 0); let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const SEDES = [['Sede Norte', 0.32], ['Sede Sur', 0.28], ['Sede Centro', 0.24], ['Sede Oeste', 0.16]];
// [especialidad, peso, tarifa COP, duración min, inasistencia base, código CUPS]
const ESPEC = [
  ['Medicina general', 0.34, 45000, 20, 0.15, '890201'],
  ['Odontología', 0.14, 60000, 30, 0.21, '890203'],
  ['Pediatría', 0.09, 70000, 20, 0.12, '890283'],
  ['Ginecología', 0.07, 85000, 20, 0.17, '890250'],
  ['Medicina interna', 0.07, 90000, 20, 0.14, '890266'],
  ['Psicología', 0.06, 65000, 40, 0.26, '890208'],
  ['Dermatología', 0.05, 95000, 20, 0.20, '890242'],
  ['Nutrición', 0.05, 50000, 30, 0.24, '890206'],
  ['Cardiología', 0.04, 110000, 20, 0.10, '890228'],
  ['Fisioterapia', 0.09, 40000, 40, 0.19, '931000'],
];
const NOMBRES = ['A. Restrepo', 'C. Valencia', 'M. Ospina', 'J. Cárdenas', 'L. Mejía', 'D. Rincón', 'P. Salazar', 'S. Quintero', 'R. Bermúdez', 'V. Arango',
  'F. Castaño', 'N. Londoño', 'G. Ochoa', 'E. Patiño', 'T. Zuluaga', 'I. Montoya', 'H. Giraldo', 'K. Duque', 'B. Escobar', 'O. Marín',
  'Y. Correa', 'W. Ríos', 'X. Vélez', 'Z. Hoyos'];
// Fictional professionals: 2-4 per specialty, fixed site.
let ni = 0;
const PROF = {};
for (const [esp] of ESPEC) {
  const n = esp === 'Medicina general' ? 6 : esp === 'Odontología' || esp === 'Fisioterapia' ? 3 : 2;
  PROF[esp] = Array.from({ length: n }, (_, k) => ({ nombre: `Dr(a). ${NOMBRES[ni++ % NOMBRES.length]}`, sede: SEDES[k % SEDES.length][0] }));
}
const CIE = {
  'Medicina general': [['J00X', 'Rinofaringitis aguda'], ['I10X', 'Hipertensión esencial'], ['E119', 'Diabetes mellitus tipo 2'], ['Z000', 'Examen médico general'], ['R51X', 'Cefalea']],
  'Odontología': [['K021', 'Caries de la dentina'], ['K051', 'Gingivitis crónica'], ['Z012', 'Examen odontológico']],
  'Pediatría': [['Z001', 'Control de crecimiento y desarrollo'], ['J069', 'Infección respiratoria aguda'], ['A09X', 'Diarrea y gastroenteritis']],
  'Ginecología': [['Z014', 'Examen ginecológico'], ['N939', 'Hemorragia uterina anormal'], ['Z348', 'Control de embarazo']],
  'Medicina interna': [['I10X', 'Hipertensión esencial'], ['E119', 'Diabetes mellitus tipo 2'], ['E785', 'Hiperlipidemia']],
  'Psicología': [['F419', 'Trastorno de ansiedad'], ['F329', 'Episodio depresivo'], ['Z634', 'Duelo']],
  'Dermatología': [['L700', 'Acné vulgar'], ['L209', 'Dermatitis atópica'], ['L409', 'Psoriasis']],
  'Nutrición': [['E669', 'Obesidad'], ['E440', 'Desnutrición moderada'], ['Z713', 'Consejería dietética']],
  'Cardiología': [['I10X', 'Hipertensión esencial'], ['I489', 'Fibrilación auricular'], ['I500', 'Insuficiencia cardiaca']],
  'Fisioterapia': [['M545', 'Lumbago'], ['M751', 'Síndrome del manguito rotador'], ['S934', 'Esguince de tobillo']],
};
const REGIMEN = [['Contributivo', 0.55], ['Subsidiado', 0.30], ['Particular', 0.08], ['Prepagada', 0.07]];
const EPS = ['EPS Andina', 'EPS Pacífico', 'EPS Valle Salud', 'EPS Nacional'];
const CANAL = [['Teléfono', 0.38], ['WhatsApp', 0.27], ['Presencial', 0.22], ['Web', 0.13]];
const HORAS = [7, 8, 9, 10, 11, 14, 15, 16, 17];

const start = new Date(Date.UTC(2025, 0, 2));
const end = new Date(Date.UTC(2026, 5, 30)); // 18 months
const days = [];
for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() !== 0) days.push(new Date(d));
const TOTAL = 30000;
const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const iso = (d) => d.toISOString().slice(0, 10);

// No-show probability: specialty base + behavioral effects (the "story" the dashboard tells).
function pNoShow(c) {
  let p = c._base;
  if (c.dia === 'Lunes') p *= 1.30;
  if (c.dia === 'Sábado') p *= 1.15;
  if (c.hora <= 7) p *= 1.35;
  if (c.hora >= 17) p *= 1.20;
  p *= 1 + Math.min(c.dias_espera, 40) * 0.022; // the longer the wait, the more people forget
  if (c.edad >= 18 && c.edad <= 30) p *= 1.30;
  if (c.edad >= 65) p *= 0.75;
  if (c.regimen === 'Subsidiado') p *= 1.15;
  if (c.regimen === 'Prepagada') p *= 0.70;
  if (c.tipo_consulta === 'Control') p *= 0.85;
  if (c.recordatorio === 'Sí') p *= 0.62;
  if (c.canal === 'Presencial') p *= 0.85;
  if (c.inasistencias_previas > 0) p *= 1 + 0.35 * c.inasistencias_previas;
  return Math.min(p, 0.85);
}

const rows = [];
for (let i = 0; i < TOTAL; i++) {
  // Busier in Q1 and after holidays, quieter in mid-December and early January.
  let d = pick(days);
  const m = d.getUTCMonth();
  if ((m === 11 && d.getUTCDate() > 15) && rnd() < 0.5) d = pick(days);
  const espName = wpick(ESPEC.map((e) => [e[0], e[1]]));
  const [esp, , tarifa, dur, base, cups] = ESPEC.find((e) => e[0] === espName);
  const prof = pick(PROF[esp]);
  const edadBase = esp === 'Pediatría' ? 1 + rnd() * 13 : esp === 'Ginecología' ? 16 + rnd() * 45 : 18 + Math.abs(gauss()) * 25 + rnd() * 20;
  const edad = Math.max(0, Math.min(92, Math.round(edadBase)));
  const sexo = esp === 'Ginecología' ? 'F' : rnd() < 0.56 ? 'F' : 'M';
  const regimen = wpick(REGIMEN);
  const canal = wpick(CANAL);
  const recordatorio = canal === 'WhatsApp' ? (rnd() < 0.7 ? 'Sí' : 'No') : rnd() < 0.35 ? 'Sí' : 'No';
  const dias_espera = Math.max(0, Math.round((esp === 'Medicina general' ? 4 : esp === 'Cardiología' || esp === 'Dermatología' ? 18 : 9) + gauss() * 6 + rnd() * 6));
  const hora = wpick(HORAS.map((h) => [h, h === 7 ? 0.9 : h === 17 ? 0.7 : 1]));
  const minuto = pick([0, 20, 40]);
  const inasistencias_previas = wpick([[0, 0.78], [1, 0.15], [2, 0.05], [3, 0.02]]);
  const c = {
    id_cita: `C${String(i + 1).padStart(6, '0')}`,
    fecha_cita: iso(d), hora, hora_txt: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
    dia: DOW[d.getUTCDay()], mes: iso(d).slice(0, 7),
    sede: prof.sede, especialidad: esp, profesional: prof.nombre, cups,
    tipo_consulta: rnd() < 0.45 ? 'Primera vez' : 'Control',
    canal, recordatorio, dias_espera, edad, sexo, regimen,
    eps: regimen === 'Particular' || regimen === 'Prepagada' ? '—' : pick(EPS),
    inasistencias_previas, valor: tarifa, duracion_min: dur,
    _base: base,
  };
  const [cod, desc] = pick(CIE[esp]);
  c.cie10 = cod; c.diagnostico = desc;
  const pNS = pNoShow(c);
  const r = rnd();
  const pCancel = 0.08, pIPS = 0.025;
  c.estado = r < pNS ? 'No asistió' : r < pNS + pCancel ? 'Canceló paciente' : r < pNS + pCancel + pIPS ? 'Canceló IPS' : 'Asistió';
  c.riesgo_modelo = Math.round(pNS * 100) / 100;
  delete c._base;
  rows.push(c);
}
rows.sort((a, b) => (a.fecha_cita + a.hora_txt).localeCompare(b.fecha_cita + b.hora_txt));

// "Tomorrow's" agenda for the risk dashboard: a separate fictional day with predicted risk only.
const manana = [];
let k = 0;
for (const [esp] of ESPEC) for (const prof of PROF[esp]) for (const h of HORAS) {
  if (rnd() < 0.35) continue;
  const edad = Math.round(18 + Math.abs(gauss()) * 25 + rnd() * 15);
  const canal = wpick(CANAL);
  const c = {
    id_cita: `M${String(++k).padStart(4, '0')}`, hora: h, hora_txt: `${String(h).padStart(2, '0')}:00`, dia: 'Lunes',
    sede: prof.sede, especialidad: esp, profesional: prof.nombre, canal, edad, regimen: wpick(REGIMEN),
    tipo_consulta: rnd() < 0.45 ? 'Primera vez' : 'Control', recordatorio: 'No',
    dias_espera: Math.max(0, Math.round(9 + gauss() * 7)), inasistencias_previas: wpick([[0, 0.75], [1, 0.17], [2, 0.06], [3, 0.02]]),
    valor: ESPEC.find((e) => e[0] === esp)[2], _base: ESPEC.find((e) => e[0] === esp)[4],
  };
  c.riesgo = Math.round(pNoShow(c) * 100) / 100;
  c.nivel = c.riesgo >= 0.35 ? 'Alto' : c.riesgo >= 0.2 ? 'Medio' : 'Bajo';
  c.paciente = `Paciente ${String(k).padStart(4, '0')}`;
  delete c._base;
  manana.push(c);
}

const out = path.join(__dirname, 'data');
fs.mkdirSync(out, { recursive: true });
const cols = Object.keys(rows[0]);
fs.writeFileSync(path.join(out, 'citas.csv'), '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => String(r[c]).replace(/;/g, ',')).join(';'))].join('\n'));
fs.writeFileSync(path.join(out, 'citas.json'), JSON.stringify(rows));
fs.writeFileSync(path.join(out, 'manana.json'), JSON.stringify(manana));

const ns = rows.filter((r) => r.estado === 'No asistió');
console.log('citas', rows.length, '| inasistencia', (ns.length / rows.length * 100).toFixed(1) + '%',
  '| ingresos perdidos', ns.reduce((a, r) => a + r.valor, 0).toLocaleString('es-CO'),
  '| mañana', manana.length, 'alto', manana.filter((m) => m.nivel === 'Alto').length);
