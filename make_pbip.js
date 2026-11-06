// Generates a Power BI project (PBIP, PBIR report + TMSL model) for the no-show dashboard.
// Usage: node make_pbip.js  -> pbi/Inasistencia.pbip
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'pbi');
const CSV = path.join(__dirname, 'data', 'citas.csv').replace(/\//g, '\\');
const T = 'Citas';
const W = (rel, obj) => {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
};
fs.rmSync(ROOT, { recursive: true, force: true });

// ---------- semantic model ----------
const cols = [
  ['id_cita', 'string'], ['fecha_cita', 'dateTime'], ['hora', 'int64'], ['hora_txt', 'string'], ['dia', 'string'],
  ['mes', 'string'], ['sede', 'string'], ['especialidad', 'string'], ['profesional', 'string'], ['cups', 'string'],
  ['tipo_consulta', 'string'], ['canal', 'string'], ['recordatorio', 'string'], ['dias_espera', 'int64'],
  ['edad', 'int64'], ['sexo', 'string'], ['regimen', 'string'], ['eps', 'string'], ['inasistencias_previas', 'int64'],
  ['valor', 'int64'], ['duracion_min', 'int64'], ['cie10', 'string'], ['diagnostico', 'string'], ['estado', 'string'],
  ['riesgo_modelo', 'double'],
];
const mType = { string: 'type text', int64: 'Int64.Type', dateTime: 'type date', double: 'type number' };
const m = [
  'let',
  `    Source = Csv.Document(File.Contents("${CSV}"), [Delimiter=";", Encoding=65001, QuoteStyle=QuoteStyle.None]),`,
  '    Headers = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),',
  `    Typed = Table.TransformColumnTypes(Headers, {${cols.map(([c, t]) => `{"${c}", ${mType[t]}}`).join(', ')}}, "en-US"),`,
  '    DiaNum = Table.AddColumn(Typed, "dia_num", each Date.DayOfWeek([fecha_cita], Day.Monday) + 1, Int64.Type),',
  '    Espera = Table.AddColumn(DiaNum, "rango_espera", each if [dias_espera] <= 3 then "0-3 días" else if [dias_espera] <= 7 then "4-7 días" else if [dias_espera] <= 14 then "8-14 días" else if [dias_espera] <= 30 then "15-30 días" else "Más de 30", type text),',
  '    EsperaOrd = Table.AddColumn(Espera, "rango_espera_orden", each if [dias_espera] <= 3 then 1 else if [dias_espera] <= 7 then 2 else if [dias_espera] <= 14 then 3 else if [dias_espera] <= 30 then 4 else 5, Int64.Type),',
  '    MesTxt = Table.AddColumn(EsperaOrd, "mes_txt", each {"Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"}{Date.Month([fecha_cita]) - 1} & " " & Text.End(Text.From(Date.Year([fecha_cita])), 2), type text)',
  'in',
  '    MesTxt',
];
const column = ([c, t]) => {
  const o = { name: c, dataType: t, sourceColumn: c, summarizeBy: 'none' };
  if (c === 'fecha_cita') o.formatString = 'yyyy-mm-dd';
  if (c === 'dia') o.sortByColumn = 'dia_num';
  if (c === 'hora_txt') o.sortByColumn = 'hora';
  return o;
};
const extra = [
  { name: 'dia_num', dataType: 'int64', sourceColumn: 'dia_num', summarizeBy: 'none', isHidden: true },
  { name: 'rango_espera', dataType: 'string', sourceColumn: 'rango_espera', summarizeBy: 'none', sortByColumn: 'rango_espera_orden' },
  { name: 'mes_txt', dataType: 'string', sourceColumn: 'mes_txt', summarizeBy: 'none', sortByColumn: 'mes' },
  { name: 'rango_espera_orden', dataType: 'int64', sourceColumn: 'rango_espera_orden', summarizeBy: 'none', isHidden: true },
];
const NS = `'${T}'[estado] = "No asistió"`;
const measures = [
  ['Citas', `COUNTROWS('${T}')`, '#,0'],
  ['Inasistencias', `CALCULATE(COUNTROWS('${T}'), ${NS})`, '#,0'],
  ['% Inasistencia', 'DIVIDE([Inasistencias], [Citas])', '0.0%'],
  ['Ingresos perdidos', `CALCULATE(SUM('${T}'[valor]), ${NS})`, '"$"#,0'],
  ['Espera promedio (días)', `AVERAGE('${T}'[dias_espera])`, '0.0'],
  ['% Inasistencia con recordatorio', `CALCULATE([% Inasistencia], '${T}'[recordatorio] = "Sí")`, '0.0%'],
  ['% Inasistencia sin recordatorio', `CALCULATE([% Inasistencia], '${T}'[recordatorio] = "No")`, '0.0%'],
  ['Inasistencias evitables (est.)', 'ROUND(CALCULATE([Inasistencias], \'Citas\'[recordatorio] = "No") * (1 - DIVIDE([% Inasistencia con recordatorio], [% Inasistencia sin recordatorio])), 0)', '#,0'],
].map(([name, expression, formatString]) => ({ name, expression, formatString }));

W('Inasistencia.SemanticModel/definition.pbism', {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
  version: '4.2',
  settings: {},
});
W('Inasistencia.SemanticModel/model.bim', {
  compatibilityLevel: 1567,
  model: {
    culture: 'es-CO',
    defaultPowerBIDataSourceVersion: 'powerBI_V3',
    sourceQueryCulture: 'es-CO',
    dataAccessOptions: { legacyRedirects: true, returnErrorValuesAsNull: true },
    tables: [{
      name: T,
      columns: cols.map(column).concat(extra),
      measures,
      partitions: [{ name: T, mode: 'import', source: { type: 'm', expression: m } }],
    }],
    annotations: [{ name: 'PBI_QueryOrder', value: JSON.stringify([T]) }],
  },
});
W('Inasistencia.SemanticModel/.platform', {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
  metadata: { type: 'SemanticModel', displayName: 'Inasistencia' },
  config: { version: '2.0', logicalId: '7c1b2d4e-5f60-4a71-8b92-a3b4c5d6e7f1' },
});

// ---------- report ----------
const RP = 'Inasistencia.Report';
W(`${RP}/definition.pbir`, {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
  version: '4.0',
  datasetReference: { byPath: { path: '../Inasistencia.SemanticModel' } },
});
W(`${RP}/.platform`, {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
  metadata: { type: 'Report', displayName: 'Inasistencia' },
  config: { version: '2.0', logicalId: '2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b' },
});
W(`${RP}/StaticResources/SharedResources/BaseThemes/CY24SU10.json`, fs.readFileSync(process.argv[2] || path.join(__dirname, 'CY24SU10.json'), 'utf8'));
W(`${RP}/definition/version.json`, {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json',
  version: '2.0.0',
});
W(`${RP}/definition/report.json`, {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.0.0/schema.json',
  themeCollection: { baseTheme: { name: 'CY24SU10', reportVersionAtImport: { visual: '1.8.95', report: '2.0.95', page: '1.3.95' }, type: 'SharedResources' } },
  resourcePackages: [{ name: 'SharedResources', type: 'SharedResources', items: [{ name: 'CY24SU10', path: 'BaseThemes/CY24SU10.json', type: 'BaseTheme' }] }],
  settings: { useStylableVisualContainerHeader: true, exportDataMode: 'AllowSummarized', defaultDrillFilterOtherVisuals: true, allowChangeFilterTypes: true, useEnhancedTooltips: true, useDefaultAggregateDisplayName: true },
});
const PAGE = 'a1b2c3d4e5f6a7b8c9d0';
W(`${RP}/definition/pages/pages.json`, {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
  pageOrder: [PAGE],
  activePageName: PAGE,
});
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const color = (hex) => ({ solid: { color: lit(`'${hex}'`) } });
W(`${RP}/definition/pages/${PAGE}/page.json`, {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json',
  name: PAGE,
  displayName: 'Inasistencia',
  displayOption: 'FitToPage',
  height: 720,
  width: 1280,
  objects: { background: [{ properties: { color: color('#F3F5F8'), transparency: lit('0D') } }] },
});

const VS = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json';
const fld = (p) => (p.startsWith('[') ? { Measure: { Expression: { SourceRef: { Entity: T } }, Property: p.slice(1, -1) } } : { Column: { Expression: { SourceRef: { Entity: T } }, Property: p } });
const proj = (p, active) => {
  const name = p.replace(/^\[|\]$/g, '');
  const o = { field: fld(p), queryRef: `${T}.${name}`, nativeQueryRef: name };
  if (active) o.active = true;
  return o;
};
let z = 0;
const visual = (id, type, [x, y, w, h], roles, { title, sort, objects } = {}) => {
  const queryState = {};
  for (const [role, fields] of Object.entries(roles)) queryState[role] = { projections: fields.map((f, i) => proj(f, role === 'Category' && i === 0)) };
  const v = { visualType: type, query: { queryState }, drillFilterOtherVisuals: true };
  if (sort) v.query.sortDefinition = { sort: [{ field: fld(sort[0]), direction: sort[1] }], isDefaultSort: true };
  if (objects) v.objects = objects;
  if (/Chart$/.test(type)) v.objects = Object.assign({
    categoryAxis: [{ properties: { showAxisTitle: lit('false') } }],
    valueAxis: [{ properties: { showAxisTitle: lit('false') } }],
  }, v.objects);
  v.visualContainerObjects = {
    background: [{ properties: { show: lit('true'), color: color('#FFFFFF'), transparency: lit('0D') } }],
    border: [{ properties: { show: lit('true'), color: color('#E2E6EC'), radius: lit('8D') } }],
  };
  if (title) v.visualContainerObjects.title = [{ properties: { show: lit('true'), text: lit(`'${title}'`), fontSize: lit('11D'), bold: lit('true') } }];
  W(`${RP}/definition/pages/${PAGE}/visuals/${id}/visual.json`, {
    $schema: VS, name: id, position: { x, y, z: (z += 1000), width: w, height: h, tabOrder: z }, visual: v,
  });
};
const textbox = (id, [x, y, w, h], runs) => {
  W(`${RP}/definition/pages/${PAGE}/visuals/${id}/visual.json`, {
    $schema: VS, name: id, position: { x, y, z: (z += 1000), width: w, height: h, tabOrder: z },
    visual: { visualType: 'textbox', objects: { general: [{ properties: { paragraphs: runs.map((r) => ({ textRuns: [r] })) } }] }, drillFilterOtherVisuals: true },
  });
};
const dataColor = (hex) => ({ dataPoint: [{ properties: { fill: color(hex) } }] });

textbox('titulo', [20, 10, 760, 60], [
  { value: 'Inasistencia a citas · Clínica Ejemplo (datos sintéticos)', textStyle: { fontWeight: 'bold', fontSize: '18pt', color: '#0B1620' } },
  { value: '30.000 citas · ene 2025 – jun 2026 · Haz clic en cualquier barra para filtrar todo el tablero', textStyle: { fontSize: '10pt', color: '#5B6878' } },
]);
visual('f_sede', 'slicer', [800, 8, 230, 66], { Values: ['sede'] }, { title: 'Sede', objects: { data: [{ properties: { mode: lit("'Dropdown'") } }], header: [{ properties: { show: lit('false') } }] } });
visual('f_esp', 'slicer', [1040, 8, 220, 66], { Values: ['especialidad'] }, { title: 'Especialidad', objects: { data: [{ properties: { mode: lit("'Dropdown'") } }], header: [{ properties: { show: lit('false') } }] } });

const kx = [20, 270, 520, 770, 1020];
[['Citas', 'Citas'], ['Inasistencias', 'Inasistencias'], ['% Inasistencia', '% Inasistencia'], ['Ingresos perdidos', 'Ingresos perdidos'], ['Inasistencias evitables (est.)', 'Evitables con recordatorio (est.)']]
  .forEach(([mz, t], i) => visual(`kpi${i}`, 'card', [kx[i], 80, 240, 90], { Values: [`[${mz}]`] }, {
    title: t,
    objects: { labels: [{ properties: { fontSize: lit('24D'), color: color(i === 2 || i === 3 ? '#D64545' : '#0B1620'), labelDisplayUnits: lit(i === 3 ? '1000000D' : '1D') } }], categoryLabels: [{ properties: { show: lit('false') } }] },
  }));

visual('tendencia', 'lineChart', [20, 180, 620, 225], { Category: ['mes_txt'], Y: ['[% Inasistencia]'] }, { title: '% de inasistencia por mes', sort: ['mes_txt', 'Ascending'] });
visual('dia', 'columnChart', [650, 180, 610, 225], { Category: ['dia'], Y: ['[% Inasistencia]'] }, { title: 'Lunes es el peor día', sort: ['dia', 'Ascending'], objects: dataColor('#2F6FDE') });
visual('esp', 'barChart', [20, 415, 420, 295], { Category: ['especialidad'], Y: ['[% Inasistencia]'] }, { title: '% de inasistencia por especialidad', sort: ['[% Inasistencia]', 'Descending'], objects: dataColor('#D64545') });
visual('espera', 'columnChart', [450, 415, 400, 295], { Category: ['rango_espera'], Y: ['[% Inasistencia]'] }, { title: 'A más espera, más inasistencia', sort: ['rango_espera', 'Ascending'], objects: dataColor('#E8963A') });
visual('recordatorio', 'columnChart', [860, 415, 400, 295], { Category: ['recordatorio'], Y: ['[% Inasistencia]'] }, { title: '¿Se envió recordatorio?', sort: ['recordatorio', 'Ascending'], objects: dataColor('#2E9E6A') });

console.log('PBIP written to', ROOT);
W('Inasistencia.pbip', {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
  version: '1.0',
  artifacts: [{ report: { path: 'Inasistencia.Report' } }],
  settings: { enableAutoRecovery: true },
});
W('.gitignore', '**/.pbi/localSettings.json\n**/.pbi/cache.abf\n');
