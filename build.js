// Packs the synthetic data into compact columnar JSON and inlines it (plus ECharts) into the dashboard pages.
// Usage: node build.js  -> out/dashboard-agenda.html, out/dashboard-riesgo.html
const fs = require('fs');
const path = require('path');

const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/citas.json'), 'utf8'));
const manana = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/manana.json'), 'utf8'));
const echarts = fs.readFileSync(path.join(__dirname, 'node_modules/echarts/dist/echarts.min.js'), 'utf8');

// Dictionary-encode the categorical columns so 30k rows fit in a few hundred KB.
const dicts = {};
const enc = (col, v) => { const d = (dicts[col] = dicts[col] || []); let i = d.indexOf(v); if (i < 0) { d.push(v); i = d.length - 1; } return i; };
const cat = ['mes', 'dia', 'sede', 'especialidad', 'profesional', 'canal', 'regimen', 'estado', 'tipo_consulta'];
const cols = { hora: [], dias_espera: [], edad: [], recordatorio: [], valor: [], previas: [] };
for (const c of cat) cols[c] = [];
for (const r of rows) {
  for (const c of cat) cols[c].push(enc(c, r[c]));
  cols.hora.push(r.hora); cols.dias_espera.push(r.dias_espera); cols.edad.push(r.edad);
  cols.recordatorio.push(r.recordatorio === 'Sí' ? 1 : 0); cols.valor.push(r.valor); cols.previas.push(r.inasistencias_previas);
}
dicts.mes.sort();
// re-encode mes after sorting so month index is chronological
cols.mes = rows.map((r) => dicts.mes.indexOf(r.mes));
const data = JSON.stringify({ n: rows.length, dicts, cols });

fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
for (const [tpl, out, payload] of [['dashboard-agenda.tpl.html', 'dashboard-agenda.html', data], ['dashboard-riesgo.tpl.html', 'dashboard-riesgo.html', JSON.stringify({ manana, hist: data })]]) {
  const p = path.join(__dirname, tpl);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, 'utf8').replace('/*ECHARTS*/', () => echarts).replace('/*DATA*/', () => payload);
  fs.writeFileSync(path.join(__dirname, 'out', out), html);
  console.log(out, (html.length / 1024).toFixed(0) + ' KB');
}
