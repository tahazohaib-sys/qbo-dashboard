// ============================================================
// REVENUE ANALYSIS — PROFESSIONAL PDF REPORT
// Google Apps Script · Team Monthly Report
// ============================================================

// ── Configuration ─────────────────────────────────────────────
const SHEET_NAME    = 'Team Monthly Report';
const PDF_NAME      = 'Revenue Analysis.pdf';
const REQUIRED_COLS = ['source', 'team', 'type', 'month', 'incoming', 'outgoing', 'net'];

// ── Brand colours ──────────────────────────────────────────────
const C = {
  navy:    '#0D3B66',
  blue:    '#1565C0',
  teal:    '#00695C',
  green:   '#2E7D32',
  red:     '#C62828',
  orange:  '#E65100',
  grey:    '#455A64',
  white:   '#FFFFFF',
  dark:    '#212121',
  mid:     '#37474F',
  muted:   '#78909C',
  ltBlue:  '#EEF2FF',
  ltGreen: '#E8F5E9',
  ltRed:   '#FFEBEE',
  border:  '#CFD8DC',
  rowAlt:  '#F5F7FF',
};

// ============================================================
// PART 1 — MENU & ENTRY POINT
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Revenue Report')
    .addItem('Generate Revenue Analysis PDF', 'generateRevenueAnalysisPDF')
    .addToUi();
}

function generateRevenueAnalysisPDF() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('Building Report…',
      'Your Revenue Analysis PDF is being generated.\nThis takes about 2–3 minutes — please wait.',
      ui.ButtonSet.OK);

    const rawData = readSheetData();
    if (!rawData) return;

    const colIdx = validateAndMapColumns(rawData.headers);
    if (!colIdx) return;

    const data     = parseRows(rawData.rows, colIdx);
    const analysis = runAnalysis(data);
    const doc      = buildReport(analysis);
    const pdfFile  = exportAsPDF(doc);

    DriveApp.getFileById(doc.getId()).setTrashed(true);

    ui.alert('Report Ready!',
      'Your Revenue Analysis PDF has been saved.\n\n' +
      'File: ' + PDF_NAME + '\nOpen: ' + pdfFile.getUrl(),
      ui.ButtonSet.OK);

  } catch (err) {
    ui.alert('Something went wrong', err.message + '\n\n' + err.stack, ui.ButtonSet.OK);
    Logger.log(err);
  }
}

// ============================================================
// PART 2 — DATA READING & PARSING
// ============================================================

function readSheetData() {
  const ui    = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  if (!sheet) {
    ui.alert('Sheet Not Found',
      'The tab "' + SHEET_NAME + '" could not be found. Please check the tab name.',
      ui.ButtonSet.OK);
    return null;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('No Data', 'The sheet appears to be empty.', ui.ButtonSet.OK);
    return null;
  }

  const all     = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = all[0].map(h => String(h).trim());
  const rows    = all.slice(1).filter(r => r.some(c => c !== '' && c !== null));

  return { headers, rows };
}

function validateAndMapColumns(headers) {
  const lower   = headers.map(h => h.toLowerCase().trim());
  const colIdx  = {};
  const missing = [];

  REQUIRED_COLS.forEach(col => {
    const idx = lower.findIndex(h => h.includes(col));
    if (idx === -1) missing.push(col);
    else colIdx[col] = idx;
  });

  const ci = lower.findIndex(h => h.includes('company'));
  if (ci !== -1) colIdx['company'] = ci;

  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert('Missing Columns',
      'The following required columns were not found:\n' + missing.join(', '),
      SpreadsheetApp.getUi().ButtonSet.OK);
    return null;
  }
  return colIdx;
}

function parseRows(rows, colIdx) {
  return rows.map((row, i) => {
    const incoming = parseCurrency(row[colIdx['incoming']]);
    const outgoing = parseCurrency(row[colIdx['outgoing']]);
    const net      = parseCurrency(row[colIdx['net']]);
    return {
      source:       String(row[colIdx['source']]   || '').trim(),
      team:         String(row[colIdx['team']]     || '').trim(),
      type:         normalizeType(String(row[colIdx['type']] || '').trim()),
      month:        normalizeMonth(String(row[colIdx['month']] || '').trim()),
      incoming, outgoing, net,
      company:      colIdx['company'] !== undefined
                    ? String(row[colIdx['company']] || '').trim() : '',
      calcMismatch: Math.abs((incoming + outgoing) - net) > 0.02,
      rowNum:       i + 2,
    };
  }).filter(r => r.team !== '' || r.source !== '');
}

function parseCurrency(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1')) || 0;
}

function normalizeMonth(raw) {
  if (!raw) return '';
  if (/^\d{4}\/\d{2}$/.test(raw)) return raw;
  const MAP = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
                JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
  const m = raw.toUpperCase().match(/^([A-Z]{3})[-\/](\d{4})$/);
  if (m && MAP[m[1]]) return m[2] + '/' + MAP[m[1]];
  return raw;
}

function normalizeType(type) {
  const l = type.toLowerCase();
  if (l.includes('fixed'))                              return 'Fixed Price';
  if (l.includes('hourly'))                             return 'Hourly';
  if (l.includes('bonus'))                              return 'Bonus';
  if (l.includes('expense') || l.includes('reimburse')) return 'Expense / Reimbursement';
  if (l.includes('refund'))                             return 'Refund';
  return type || 'Other';
}

// ============================================================
// PART 3 — ANALYSIS ENGINE
// ============================================================

function runAnalysis(data) {
  const monthMap = {}, companyMap = {}, teamMap = {}, sourceMap = {}, typeMap = {};
  const issues = [];
  let totalIncoming = 0, totalOutgoing = 0, totalNet = 0;

  data.forEach(r => {
    if (!r.month && !r.team) return;
    totalIncoming += r.incoming;
    totalOutgoing += r.outgoing;
    totalNet      += r.net;

    if (r.month) {
      if (!monthMap[r.month]) monthMap[r.month] = { incoming:0, outgoing:0, net:0, count:0 };
      monthMap[r.month].incoming += r.incoming;
      monthMap[r.month].outgoing += r.outgoing;
      monthMap[r.month].net      += r.net;
      monthMap[r.month].count++;
    }
    if (r.company) {
      if (!companyMap[r.company]) companyMap[r.company] = { incoming:0, outgoing:0, net:0 };
      companyMap[r.company].incoming += r.incoming;
      companyMap[r.company].outgoing += r.outgoing;
      companyMap[r.company].net      += r.net;
    }
    if (r.team) {
      if (!teamMap[r.team])
        teamMap[r.team] = { incoming:0, outgoing:0, net:0, count:0, company:r.company, source:r.source };
      teamMap[r.team].incoming += r.incoming;
      teamMap[r.team].outgoing += r.outgoing;
      teamMap[r.team].net      += r.net;
      teamMap[r.team].count++;
    }
    if (r.source) {
      if (!sourceMap[r.source]) sourceMap[r.source] = { incoming:0, outgoing:0, net:0, count:0 };
      sourceMap[r.source].incoming += r.incoming;
      sourceMap[r.source].outgoing += r.outgoing;
      sourceMap[r.source].net      += r.net;
      sourceMap[r.source].count++;
    }
    if (!typeMap[r.type]) typeMap[r.type] = { incoming:0, outgoing:0, net:0, count:0 };
    typeMap[r.type].incoming += r.incoming;
    typeMap[r.type].outgoing += r.outgoing;
    typeMap[r.type].net      += r.net;
    typeMap[r.type].count++;

    // Data quality
    if (r.calcMismatch)
      issues.push({ row: r.rowNum, client: r.team,
        issue: 'Calculation discrepancy',
        detail: 'Expected ' + fmtN(r.incoming + r.outgoing) + ', recorded as ' + fmtN(r.net) });
    if (!r.source)
      issues.push({ row: r.rowNum, client: r.team,
        issue: 'Missing channel', detail: 'No channel / source value entered' });
    if (!r.company && r.team)
      issues.push({ row: r.rowNum, client: r.team,
        issue: 'Missing company', detail: 'Company field is blank' });
  });

  if (Object.keys(teamMap).some(k => k.toLowerCase().includes('syestem')))
    issues.push({ row: '—', client: 'Wowza Media Syestems',
      issue: 'Spelling error', detail: 'Should be "Wowza Media Systems"' });

  const months     = Object.keys(monthMap).sort().map(m => ({ month:m, ...monthMap[m] }));
  const fullMonths = months.filter(m => m.count >= 2);
  const bestMonth  = fullMonths.length ? fullMonths.reduce((a,b) => a.net > b.net ? a : b) : null;
  const worstMonth = fullMonths.length ? fullMonths.reduce((a,b) => a.net < b.net ? a : b) : null;
  const partial    = months.filter(m => m.count < 2);

  const companies = toSortedArray(companyMap);
  const teams     = toSortedArray(teamMap);
  const sources   = toSortedArray(sourceMap);
  const types     = toSortedArray(typeMap);

  // Dynamic latest 3 months (no hardcoding)
  const latestMonth   = months.length >= 1 ? months[months.length - 1] : null;
  const prevMonth     = months.length >= 2 ? months[months.length - 2] : null;
  const prevPrevMonth = months.length >= 3 ? months[months.length - 3] : null;

  const latestTopTeams = latestMonth
    ? data.filter(r => r.month === latestMonth.month)
           .reduce((acc, r) => { acc[r.team] = (acc[r.team] || 0) + r.net; return acc; }, {})
    : {};
  const latestTopTeamsList = Object.entries(latestTopTeams)
    .map(([team, net]) => ({ team, net }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 5);

  return {
    totalIncoming, totalOutgoing, totalNet,
    months, bestMonth, worstMonth, partial,
    companies, teams, sources, types,
    latestMonth, prevMonth, prevPrevMonth, latestTopTeamsList,
    issues,
    totalRecords: data.length,
    dateGenerated: new Date(),
  };
}

function toSortedArray(map) {
  return Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.net - a.net);
}

// ── Formatters ────────────────────────────────────────────────

function fmtN(n) {
  if (n == null || isNaN(n)) return '$0.00';
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtP(n) {
  if (n == null || isNaN(n)) return '0.0%';
  return n.toFixed(1) + '%';
}

function fmtMonth(raw) {
  if (!raw) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p = raw.split('/');
  return p.length === 2 ? (MONTHS[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0] : raw;
}

// ============================================================
// PART 4 — CHART BUILDERS  (Charts Service → real PNG images)
// ============================================================

function safeChart(fn) {
  try { return fn(); }
  catch (e) { Logger.log('Chart error: ' + e.message); return null; }
}

function chartLineNet(months) {
  if (months.length < 2) return null;
  const dt = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, 'Month')
    .addColumn(Charts.ColumnType.NUMBER, 'Net Revenue');
  months.forEach(m => dt.addRow([fmtMonth(m.month), m.net]));
  return Charts.newLineChart()
    .setDataTable(dt.build())
    .setTitle('Monthly Net Revenue Trend')
    .setXAxisTitle('Month')
    .setYAxisTitle('Net Revenue ($)')
    .setDimensions(560, 300)
    .setColors([C.blue])
    .setLegendPosition(Charts.Position.NONE)
    .setCurveStyle(Charts.CurveStyle.SMOOTH)
    .build().getAs('image/png');
}

function chartColInOut(months) {
  if (months.length < 2) return null;
  const dt = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, 'Month')
    .addColumn(Charts.ColumnType.NUMBER, 'Gross Revenue')
    .addColumn(Charts.ColumnType.NUMBER, 'Deductions');
  months.forEach(m => dt.addRow([fmtMonth(m.month), m.incoming, Math.abs(m.outgoing)]));
  return Charts.newColumnChart()
    .setDataTable(dt.build())
    .setTitle('Gross Revenue vs Deductions by Month')
    .setXAxisTitle('Month')
    .setYAxisTitle('Amount ($)')
    .setDimensions(560, 300)
    .setColors([C.blue, C.red])
    .setLegendPosition(Charts.Position.BOTTOM)
    .build().getAs('image/png');
}

function chartPieCompany(companies) {
  const pos = companies.filter(c => c.net > 0);
  if (!pos.length) return null;
  const dt = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, 'Company')
    .addColumn(Charts.ColumnType.NUMBER, 'Net Revenue');
  pos.forEach(c => dt.addRow([c.name, c.net]));
  return Charts.newPieChart()
    .setDataTable(dt.build())
    .setTitle('Net Revenue by Company')
    .setDimensions(500, 290)
    .setLegendPosition(Charts.Position.RIGHT)
    .build().getAs('image/png');
}

function chartBarClients(teams) {
  const top = teams.slice(0, 10);
  if (!top.length) return null;
  const dt = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, 'Client')
    .addColumn(Charts.ColumnType.NUMBER, 'Net Revenue');
  // Reverse so the highest earner appears at the top of the horizontal bar chart
  top.slice().reverse().forEach(t => dt.addRow([t.name, t.net]));
  return Charts.newBarChart()
    .setDataTable(dt.build())
    .setTitle('Top 10 Clients by Net Revenue')
    .setXAxisTitle('Net Revenue ($)')
    .setDimensions(560, 370)
    .setColors([C.teal])
    .setLegendPosition(Charts.Position.NONE)
    .build().getAs('image/png');
}

function chartPieSource(sources) {
  const pos = sources.filter(s => s.net > 0);
  if (!pos.length) return null;
  const dt = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, 'Channel')
    .addColumn(Charts.ColumnType.NUMBER, 'Net Revenue');
  pos.forEach(s => dt.addRow([s.name, s.net]));
  return Charts.newPieChart()
    .setDataTable(dt.build())
    .setTitle('Net Revenue by Revenue Channel')
    .setDimensions(500, 290)
    .setLegendPosition(Charts.Position.RIGHT)
    .build().getAs('image/png');
}

function chartColTypes(types) {
  if (!types.length) return null;
  const dt = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, 'Contract Type')
    .addColumn(Charts.ColumnType.NUMBER, 'Net Revenue');
  types.forEach(t => dt.addRow([t.name, t.net]));
  return Charts.newColumnChart()
    .setDataTable(dt.build())
    .setTitle('Net Revenue by Contract Type')
    .setXAxisTitle('Contract Type')
    .setYAxisTitle('Net Revenue ($)')
    .setDimensions(480, 280)
    .setColors([C.teal])
    .setLegendPosition(Charts.Position.NONE)
    .build().getAs('image/png');
}

// Inserts a chart image centred with an optional caption line
function insertChartImage(body, blob, caption) {
  if (!blob) return;
  const para = body.appendParagraph('');
  para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const img = para.appendInlineImage(blob);
  const origW = img.getWidth(), origH = img.getHeight(), targetW = 490;
  img.setWidth(targetW).setHeight(Math.round(origH * targetW / origW));
  if (caption) {
    const cp = body.appendParagraph(caption);
    cp.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    cp.editAsText().setFontSize(9).setItalic(true).setForegroundColor(C.muted).setFontFamily('Arial');
  }
  spacer(body);
}

// ============================================================
// PART 5 — DOCUMENT LAYOUT HELPERS
// ============================================================

// Fixed spacer — 'sm' = 4 pt, 'md' (default) = 7 pt, 'lg' = 13 pt
function spacer(body, size) {
  const pt = size === 'sm' ? 4 : size === 'lg' ? 13 : 7;
  body.appendParagraph('').editAsText().setFontSize(pt);
}

// Full-width coloured banner (used on cover + as section divider accent)
function banner(body, text, bg, fg, size) {
  const tbl  = body.appendTable([[text || '']]);
  const cell = tbl.getCell(0, 0);
  cell.setBackgroundColor(bg || C.navy)
      .setPaddingTop(14).setPaddingBottom(14)
      .setPaddingLeft(24).setPaddingRight(24);
  cell.editAsText()
      .setFontSize(size || 22).setBold(true)
      .setForegroundColor(fg || C.white).setFontFamily('Arial');
  tbl.setBorderColor(bg || C.navy);
  spacer(body, 'sm');
}

// Section heading with navy underline rule
function sectionHead(body, title) {
  const p = body.appendParagraph(title);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  p.editAsText().setFontSize(15).setBold(true)
   .setForegroundColor(C.navy).setFontFamily('Arial');
  body.appendHorizontalRule();
  spacer(body, 'sm');
}

// Sub-heading
function subHead(body, title) {
  const p = body.appendParagraph(title);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  p.editAsText().setFontSize(12).setBold(true)
   .setForegroundColor(C.mid).setFontFamily('Arial');
  spacer(body, 'sm');
}

// Body paragraph
function para(body, text, color, size) {
  const p = body.appendParagraph(text);
  p.editAsText().setFontSize(size || 10.5)
   .setForegroundColor(color || C.dark).setFontFamily('Arial');
  return p;
}

// Coloured callout box (single-cell table used as an alert/highlight)
function callout(body, text, bg, fg) {
  const tbl  = body.appendTable([[text]]);
  const cell = tbl.getCell(0, 0);
  cell.setBackgroundColor(bg || C.ltBlue)
      .setPaddingTop(8).setPaddingBottom(8)
      .setPaddingLeft(14).setPaddingRight(14);
  cell.editAsText().setFontSize(10.5)
      .setForegroundColor(fg || C.navy).setFontFamily('Arial');
  tbl.setBorderColor(bg || C.ltBlue);
  spacer(body, 'sm');
}

// Three-column KPI card row
function kpiRow(body, l1, v1, col1, l2, v2, col2, l3, v3, col3) {
  const bgMap = [col1 || C.blue, col2 || C.red, col3 || C.green];
  const ltMap = [C.ltBlue, C.ltRed, C.ltGreen];
  const tbl   = body.appendTable([[l1, l2, l3], [v1, v2, v3]]);
  for (let c = 0; c < 3; c++) {
    tbl.getCell(0, c)
       .setBackgroundColor(bgMap[c])
       .setPaddingTop(9).setPaddingBottom(9).setPaddingLeft(12).setPaddingRight(12);
    tbl.getCell(0, c).editAsText()
       .setFontSize(9).setBold(true).setForegroundColor(C.white).setFontFamily('Arial');
    tbl.getCell(1, c)
       .setBackgroundColor(ltMap[c])
       .setPaddingTop(9).setPaddingBottom(9).setPaddingLeft(12).setPaddingRight(12);
    tbl.getCell(1, c).editAsText()
       .setFontSize(17).setBold(true).setForegroundColor(bgMap[c]).setFontFamily('Arial');
  }
  tbl.setBorderColor(C.border);
  spacer(body);
}

// Styled data table — navy header, alternating rows, optional totals row
function dataTable(body, rows, hasTotals) {
  const tbl = body.appendTable(rows);
  const R   = tbl.getNumRows();
  for (let r = 0; r < R; r++) {
    const isHdr = r === 0;
    const isTot = hasTotals && r === R - 1;
    const cols  = tbl.getRow(r).getNumCells();
    for (let c = 0; c < cols; c++) {
      const cell = tbl.getCell(r, c);
      cell.setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(8).setPaddingRight(8);
      if (isHdr) {
        cell.setBackgroundColor(C.navy);
        cell.editAsText().setFontSize(9).setBold(true)
            .setForegroundColor(C.white).setFontFamily('Arial');
      } else if (isTot) {
        cell.setBackgroundColor(C.ltBlue);
        cell.editAsText().setFontSize(9.5).setBold(true)
            .setForegroundColor(C.navy).setFontFamily('Arial');
      } else {
        cell.setBackgroundColor(r % 2 === 0 ? C.white : C.rowAlt);
        cell.editAsText().setFontSize(9.5)
            .setForegroundColor(C.dark).setFontFamily('Arial');
      }
    }
  }
  tbl.setBorderColor(C.border);
  spacer(body);
  return tbl;
}

// ============================================================
// PART 6 — REPORT BUILDER  (orchestrates all sections)
// ============================================================

function buildReport(a) {
  const doc  = DocumentApp.create('_RevAnalysis_Temp_' + Date.now());
  const body = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(54).setMarginRight(54);

  // Generate all charts upfront (each is a real PNG from the Charts service)
  const charts = {
    lineNet:   safeChart(() => chartLineNet(a.months)),
    colInOut:  safeChart(() => chartColInOut(a.months)),
    pieComp:   safeChart(() => chartPieCompany(a.companies)),
    barClient: safeChart(() => chartBarClients(a.teams)),
    pieSrc:    safeChart(() => chartPieSource(a.sources)),
    colType:   safeChart(() => chartColTypes(a.types)),
  };

  addCover(body, a);                           body.appendPageBreak();
  addExecutiveSummary(body, a);                body.appendPageBreak();
  addMonthlyTrend(body, a, charts);            body.appendPageBreak();
  addCompanySection(body, a, charts);          body.appendPageBreak();
  addClientSection(body, a, charts);           body.appendPageBreak();
  addChannelSection(body, a, charts);          body.appendPageBreak();
  addContractTypeSection(body, a, charts);     body.appendPageBreak();
  addLatestMonthSection(body, a);              body.appendPageBreak();
  addDataHealthSection(body, a);               body.appendPageBreak();
  addInsightsSection(body, a);                 body.appendPageBreak();
  addRecommendations(body, a);                 body.appendPageBreak();
  addConclusion(body, a);

  doc.saveAndClose();
  return doc;
}

// ============================================================
// PART 7 — SECTION BUILDERS
// ============================================================

// ── Cover Page ────────────────────────────────────────────────
function addCover(body, a) {
  spacer(body, 'lg');
  spacer(body, 'lg');

  banner(body, 'REVENUE ANALYSIS', C.navy, C.white, 34);

  const sub = body.appendParagraph('Team Monthly Performance Report');
  sub.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  sub.editAsText().setFontSize(16).setForegroundColor(C.mid).setFontFamily('Arial');

  spacer(body, 'lg');

  const period = a.months.length
    ? fmtMonth(a.months[0].month) + ' – ' + fmtMonth(a.months[a.months.length - 1].month)
    : 'N/A';

  const meta = [
    ['Prepared On',   Utilities.formatDate(a.dateGenerated, Session.getScriptTimeZone(), 'MMMM dd, yyyy')],
    ['Report Period', period],
    ['Transactions',  String(a.totalRecords) + ' entries'],
    ['Data Source',   'Google Sheets — "' + SHEET_NAME + '"'],
  ];
  const tbl = body.appendTable(meta);
  for (let r = 0; r < meta.length; r++) {
    tbl.getCell(r, 0).setBackgroundColor(C.ltBlue)
       .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(14).setPaddingRight(14);
    tbl.getCell(r, 0).editAsText()
       .setFontSize(10).setBold(true).setForegroundColor(C.navy).setFontFamily('Arial');
    tbl.getCell(r, 1).setBackgroundColor(C.white)
       .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(14).setPaddingRight(14);
    tbl.getCell(r, 1).editAsText()
       .setFontSize(10).setForegroundColor(C.dark).setFontFamily('Arial');
  }
  tbl.setBorderColor(C.border);

  spacer(body, 'lg');
  spacer(body, 'lg');
  spacer(body, 'lg');

  body.appendHorizontalRule();
  spacer(body, 'sm');
  const conf = body.appendParagraph('CONFIDENTIAL  ·  For Internal Use Only');
  conf.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  conf.editAsText().setFontSize(9).setItalic(true).setForegroundColor(C.muted).setFontFamily('Arial');
}

// ── Executive Summary ─────────────────────────────────────────
function addExecutiveSummary(body, a) {
  sectionHead(body, '1.  Executive Overview');

  const margin = a.totalIncoming ? a.totalNet / a.totalIncoming * 100 : 0;
  const dedPct = a.totalIncoming ? Math.abs(a.totalOutgoing / a.totalIncoming) * 100 : 0;

  kpiRow(body,
    'GROSS REVENUE',    fmtN(a.totalIncoming), C.blue,
    'TOTAL DEDUCTIONS', fmtN(Math.abs(a.totalOutgoing)), C.red,
    'NET REVENUE',      fmtN(a.totalNet), C.green);

  let health, hColor, hBg;
  if (margin >= 80)      { health = 'Excellent — Very strong net margin';        hColor = C.green;  hBg = C.ltGreen; }
  else if (margin >= 65) { health = 'Healthy — Good net margin';                 hColor = C.teal;   hBg = '#E0F2F1'; }
  else if (margin >= 50) { health = 'Fair — Monitor deduction levels';           hColor = C.orange; hBg = '#FFF3E0'; }
  else                   { health = 'Needs Attention — Low net margin';          hColor = C.red;    hBg = C.ltRed;  }

  callout(body,
    'Revenue Health: ' + health +
    '   |   Net Margin: ' + fmtP(margin) +
    '   |   Deduction Rate: ' + fmtP(dedPct),
    hBg, hColor);

  subHead(body, 'Summary');
  const top = {
    co:  a.companies[0] ? a.companies[0].name : 'N/A',
    tm:  a.teams[0]     ? a.teams[0].name     : 'N/A',
    src: a.sources[0]   ? a.sources[0].name   : 'N/A',
  };
  para(body,
    'The business generated ' + fmtN(a.totalNet) + ' in net revenue across ' + a.months.length +
    ' months, achieving a ' + fmtP(margin) + ' net margin. ' +
    'Top-performing company: ' + top.co + '. Highest-earning client: ' + top.tm + '. ' +
    'Strongest revenue channel: ' + top.src + '. ' +
    (a.bestMonth ? 'Best month: ' + fmtMonth(a.bestMonth.month) + ' (' + fmtN(a.bestMonth.net) + '). ' : '') +
    (dedPct > 15
      ? 'Deductions at ' + fmtP(dedPct) + ' are above the 15% threshold — review agency fee structures.'
      : 'Deduction levels are within a healthy range.')
  );
}

// ── Monthly Revenue Trend ─────────────────────────────────────
function addMonthlyTrend(body, a, charts) {
  sectionHead(body, '2.  Monthly Revenue Trend');

  if (a.bestMonth)
    callout(body, 'Best Month: ' + fmtMonth(a.bestMonth.month) + ' — ' + fmtN(a.bestMonth.net) + ' net revenue', C.ltGreen, C.green);
  if (a.worstMonth && a.worstMonth.month !== (a.bestMonth || {}).month)
    callout(body, 'Weakest Month: ' + fmtMonth(a.worstMonth.month) + ' — ' + fmtN(a.worstMonth.net) + ' net revenue', C.ltRed, C.red);
  if (a.partial.length)
    callout(body,
      'Months with fewer than 2 entries (may be incomplete): ' +
      a.partial.map(m => fmtMonth(m.month)).join(', '),
      '#FFF8E1', C.orange);

  subHead(body, 'Month-by-Month Breakdown');
  const rows = [['Month', 'Gross Revenue', 'Deductions', 'Net Revenue', 'Entries']];
  a.months.forEach(m => rows.push([
    fmtMonth(m.month) + (m.count < 2 ? ' *' : ''),
    fmtN(m.incoming), fmtN(Math.abs(m.outgoing)), fmtN(m.net), String(m.count)
  ]));
  rows.push(['TOTAL',
    fmtN(a.totalIncoming), fmtN(Math.abs(a.totalOutgoing)), fmtN(a.totalNet), String(a.totalRecords)]);
  dataTable(body, rows, true);

  subHead(body, 'Month-over-Month Change');
  const mom = [['Month', 'Net Revenue', 'Change ($)', 'Change (%)']];
  a.months.forEach((m, i) => {
    if (i === 0) { mom.push([fmtMonth(m.month), fmtN(m.net), '—', '—']); return; }
    const prev = a.months[i - 1], diff = m.net - prev.net;
    const pct  = prev.net ? diff / Math.abs(prev.net) * 100 : 0;
    mom.push([fmtMonth(m.month), fmtN(m.net),
      (diff >= 0 ? '+' : '-') + fmtN(Math.abs(diff)),
      (pct  >= 0 ? '+' : '') + fmtP(pct)]);
  });
  dataTable(body, mom, false);

  insertChartImage(body, charts.lineNet,  'Figure 1 — Monthly Net Revenue Trend');
  insertChartImage(body, charts.colInOut, 'Figure 2 — Gross Revenue vs Deductions by Month');
}

// ── Company Performance ───────────────────────────────────────
function addCompanySection(body, a, charts) {
  sectionHead(body, '3.  Company Performance');

  if (!a.companies.length) {
    para(body, 'No company data available. Please ensure the "Company" column is filled in the source sheet.', C.orange);
    return;
  }

  const rows = [['Company', 'Gross Revenue', 'Deductions', 'Net Revenue', 'Share of Total']];
  a.companies.forEach(c => rows.push([
    c.name, fmtN(c.incoming), fmtN(Math.abs(c.outgoing)), fmtN(c.net),
    fmtP(a.totalNet ? c.net / a.totalNet * 100 : 0)
  ]));
  dataTable(body, rows, false);

  insertChartImage(body, charts.pieComp, 'Figure 3 — Net Revenue Share by Company');

  subHead(body, 'Concentration Risk');
  const topPct = a.totalNet ? a.companies[0].net / a.totalNet * 100 : 0;
  let risk, rColor, rBg;
  if (a.companies.length === 1) {
    risk = 'High Risk — All revenue comes from a single company (' + a.companies[0].name + '). Diversification is strongly recommended.';
    rColor = C.red; rBg = C.ltRed;
  } else if (topPct > 70) {
    risk = 'High Risk — ' + a.companies[0].name + ' contributes ' + fmtP(topPct) + ' of total net revenue, creating significant dependency.';
    rColor = C.red; rBg = C.ltRed;
  } else if (topPct > 50) {
    risk = 'Moderate Risk — ' + a.companies[0].name + ' drives ' + fmtP(topPct) + ' of revenue. Consider growing the other company\'s share.';
    rColor = C.orange; rBg = '#FFF3E0';
  } else {
    risk = 'Well Diversified — No single company exceeds 50% of revenue. Concentration risk is low.';
    rColor = C.green; rBg = C.ltGreen;
  }
  callout(body, risk, rBg, rColor);
}

// ── Client Performance ────────────────────────────────────────
function addClientSection(body, a, charts) {
  sectionHead(body, '4.  Client Performance');

  const top10 = a.teams.slice(0, 10);
  const low5  = a.teams.filter(t => t.net > 0).slice(-5).reverse();
  const loyal = a.teams.filter(t => t.count >= 3);

  subHead(body, 'Top 10 Clients by Net Revenue');
  const rows = [['#', 'Client', 'Company', 'Gross Revenue', 'Net Revenue', 'Engagements']];
  top10.forEach((t, i) => rows.push([
    String(i + 1), t.name, t.company || '—',
    fmtN(t.incoming), fmtN(t.net), String(t.count)
  ]));
  dataTable(body, rows, false);

  insertChartImage(body, charts.barClient, 'Figure 4 — Top 10 Clients by Net Revenue');

  if (low5.length) {
    subHead(body, 'Lowest-Earning Active Clients');
    const lr = [['Client', 'Company', 'Net Revenue', 'Engagements']];
    low5.forEach(t => lr.push([t.name, t.company || '—', fmtN(t.net), String(t.count)]));
    dataTable(body, lr, false);
  }

  subHead(body, 'Loyal Clients  (3 or More Engagements)');
  if (loyal.length) {
    const rr = [['Client', 'Engagements', 'Total Net Revenue']];
    loyal.forEach(t => rr.push([t.name, String(t.count), fmtN(t.net)]));
    dataTable(body, rr, false);
  } else {
    para(body, 'No clients with 3 or more engagements were found in this period.', C.muted);
  }
  spacer(body, 'sm');

  para(body,
    'Top client ' + (top10[0] || {name:'N/A'}).name + ' earned ' + fmtN((top10[0] || {net:0}).net) + ' net. ' +
    (loyal.length ? loyal.length + ' client(s) show strong repeat engagement — ideal candidates for long-term agreements. ' : '') +
    'Lower-volume clients should be reviewed for upsell opportunities or resource reallocation.'
  );
}

// ── Revenue by Channel ────────────────────────────────────────
function addChannelSection(body, a, charts) {
  sectionHead(body, '5.  Revenue by Channel');

  const rows = [['Channel', 'Gross Revenue', 'Deductions', 'Net Revenue', 'Share', 'Engagements']];
  a.sources.forEach(s => rows.push([
    s.name, fmtN(s.incoming), fmtN(Math.abs(s.outgoing)), fmtN(s.net),
    fmtP(a.totalNet ? s.net / a.totalNet * 100 : 0), String(s.count)
  ]));
  dataTable(body, rows, false);

  insertChartImage(body, charts.pieSrc, 'Figure 5 — Net Revenue Share by Channel');

  const direct = a.sources.find(s => s.name.toLowerCase() === 'direct');
  const small  = a.sources.filter(s => a.totalNet && s.net / a.totalNet < 0.05);
  para(body,
    'Strongest channel: "' + (a.sources[0] || {name:'N/A'}).name + '" — ' + fmtN((a.sources[0] || {net:0}).net) + ' net. ' +
    (direct ? '"Direct" engagements carry zero deduction costs and are the highest-margin channel. ' +
      'Expanding direct client relationships is recommended. ' : '') +
    (small.length ? 'Underperforming channels (under 5% share): ' +
      small.map(s => s.name).join(', ') + '.' : '')
  );
}

// ── Revenue by Contract Type ──────────────────────────────────
function addContractTypeSection(body, a, charts) {
  sectionHead(body, '6.  Revenue by Contract Type');

  const rows = [['Contract Type', 'Gross Revenue', 'Deductions', 'Net Revenue', 'Share', 'Count']];
  a.types.forEach(t => rows.push([
    t.name, fmtN(t.incoming), fmtN(Math.abs(t.outgoing)), fmtN(t.net),
    fmtP(a.totalNet ? t.net / a.totalNet * 100 : 0), String(t.count)
  ]));
  dataTable(body, rows, false);

  insertChartImage(body, charts.colType, 'Figure 6 — Net Revenue by Contract Type');

  const top = a.types[0] || {name:'N/A', net:0};
  para(body,
    'The dominant contract type is "' + top.name + '", making up ' +
    fmtP(a.totalNet ? top.net / a.totalNet * 100 : 0) + ' of total net revenue. ' +
    'Fixed Price contracts provide revenue predictability, while Hourly contracts reflect active team utilization. ' +
    'Expenses and refunds should be kept minimal to protect margins.'
  );
}

// ── Latest Month Spotlight  (fully dynamic — no hardcoded dates) ──
function addLatestMonthSection(body, a) {
  if (!a.latestMonth) return;
  const lm    = a.latestMonth;
  const label = fmtMonth(lm.month);

  sectionHead(body, '7.  ' + label + ' Spotlight');

  kpiRow(body,
    'GROSS REVENUE', fmtN(lm.incoming),           C.blue,
    'DEDUCTIONS',    fmtN(Math.abs(lm.outgoing)), C.red,
    'NET REVENUE',   fmtN(lm.net),                C.green);

  subHead(body, 'Three-Month Comparison');
  const cmp = [['Month', 'Gross Revenue', 'Net Revenue', 'vs ' + label]];
  if (a.prevPrevMonth) {
    const diff = lm.net - a.prevPrevMonth.net;
    cmp.push([fmtMonth(a.prevPrevMonth.month), fmtN(a.prevPrevMonth.incoming), fmtN(a.prevPrevMonth.net),
      (diff >= 0 ? label + ' higher by ' : label + ' lower by ') + fmtN(Math.abs(diff))]);
  }
  if (a.prevMonth) {
    const diff = lm.net - a.prevMonth.net;
    cmp.push([fmtMonth(a.prevMonth.month), fmtN(a.prevMonth.incoming), fmtN(a.prevMonth.net),
      (diff >= 0 ? label + ' higher by ' : label + ' lower by ') + fmtN(Math.abs(diff))]);
  }
  cmp.push([label, fmtN(lm.incoming), fmtN(lm.net), '— Current month']);
  dataTable(body, cmp, false);

  if (a.latestTopTeamsList.length) {
    subHead(body, 'Top Clients in ' + label);
    const tr = [['#', 'Client', 'Net Revenue']];
    a.latestTopTeamsList.forEach((t, i) => tr.push([String(i + 1), t.team, fmtN(t.net)]));
    dataTable(body, tr, false);
  }

  subHead(body, 'Performance Assessment');
  let msg, mColor, mBg;
  if (a.prevMonth) {
    const change = lm.net - a.prevMonth.net;
    const pct    = a.prevMonth.net ? change / Math.abs(a.prevMonth.net) * 100 : 0;
    if (change < 0) {
      msg    = label + ' net revenue declined by ' + fmtN(Math.abs(change)) + ' (' + fmtP(Math.abs(pct)) +
               ') vs ' + fmtMonth(a.prevMonth.month) + '. Review client activity and any paused engagements.';
      mColor = C.red; mBg = C.ltRed;
    } else {
      msg    = label + ' net revenue grew by ' + fmtN(change) + ' (' + fmtP(pct) +
               ') vs ' + fmtMonth(a.prevMonth.month) + ' — positive momentum.';
      mColor = C.green; mBg = C.ltGreen;
    }
  } else {
    msg    = label + ' is the first month on record. Use subsequent months to establish a trend.';
    mColor = C.navy; mBg = C.ltBlue;
  }
  callout(body, msg, mBg, mColor);
}

// ── Data Health Review ────────────────────────────────────────
function addDataHealthSection(body, a) {
  sectionHead(body, '8.  Data Health Review');

  if (!a.issues.length) {
    callout(body, 'All records passed validation — no data issues detected.', C.ltGreen, C.green);
    return;
  }

  callout(body,
    a.issues.length + ' issue(s) were found and should be corrected before the next reporting cycle.',
    '#FFF3E0', C.orange);
  spacer(body, 'sm');

  const rows = [['Row', 'Client', 'Issue', 'Details']];
  a.issues.forEach(i => rows.push([String(i.row), i.client || '—', i.issue, i.detail || '—']));
  dataTable(body, rows, false);

  para(body, 'Please correct these entries directly in the source sheet.', C.grey);
}

// ── Key Insights ──────────────────────────────────────────────
function addInsightsSection(body, a) {
  sectionHead(body, '9.  Key Insights');

  const margin = a.totalIncoming ? a.totalNet / a.totalIncoming * 100 : 0;
  const ded    = a.totalIncoming ? Math.abs(a.totalOutgoing / a.totalIncoming) * 100 : 0;
  const direct = a.sources.find(s => s.name.toLowerCase() === 'direct');

  const insights = [
    'Total net revenue of ' + fmtN(a.totalNet) + ' was earned across ' + a.months.length + ' months, with a net margin of ' + fmtP(margin) + '.',
    a.companies[0] ? a.companies[0].name + ' is the leading company, contributing ' + fmtP(a.totalNet ? a.companies[0].net / a.totalNet * 100 : 0) + ' of total net revenue.' : null,
    a.teams[0] ? a.teams[0].name + ' is the highest-earning client, generating ' + fmtN(a.teams[0].net) + ' net.' : null,
    direct ? '"Direct" engagements produced ' + fmtN(direct.net) + ' with zero deductions — the most cost-efficient revenue channel.' : null,
    a.bestMonth ? fmtMonth(a.bestMonth.month) + ' was the strongest month at ' + fmtN(a.bestMonth.net) + ' net revenue.' : null,
    a.types[0] ? '"' + a.types[0].name + '" is the dominant contract type, making up ' + fmtP(a.totalNet ? a.types[0].net / a.totalNet * 100 : 0) + ' of net revenue.' : null,
    'The overall deduction rate is ' + fmtP(ded) + (ded > 12 ? ' — above the 12% benchmark. Review agency fee arrangements.' : ' — within an acceptable range.'),
    a.issues.length
      ? a.issues.length + ' data quality issue(s) were identified and should be corrected promptly.'
      : 'No data quality issues were found — the dataset is clean.',
  ].filter(Boolean);

  insights.forEach((text, i) => {
    const p = body.appendParagraph('');
    p.editAsText()
     .appendText((i + 1) + '.   ').setBold(true).setFontSize(10.5).setForegroundColor(C.blue).setFontFamily('Arial')
     .appendText(text).setBold(false).setFontSize(10.5).setForegroundColor(C.dark).setFontFamily('Arial');
    spacer(body, 'sm');
  });
}

// ── Recommendations ───────────────────────────────────────────
function addRecommendations(body, a) {
  sectionHead(body, '10.  Recommendations');

  const ded      = a.totalIncoming ? Math.abs(a.totalOutgoing / a.totalIncoming) * 100 : 0;
  const direct   = a.sources.find(s => s.name.toLowerCase() === 'direct');
  const topCo    = a.companies[0];
  const topPct   = topCo && a.totalNet ? topCo.net / a.totalNet * 100 : 0;
  const weak     = a.teams.filter(t => t.net > 0 && t.net < 1000);
  const topNames = a.teams.slice(0, 3).map(t => t.name).join(', ');

  const recs = [
    { icon:'🎯', title:'Prioritise Top Clients',
      body: 'Allocate maximum capacity to ' + topNames + ' — these clients deliver the highest returns and should receive dedicated attention.' },
    weak.length ? { icon:'📋', title:'Review Low-Value Clients',
      body: weak.length + ' client(s) earned under $1,000 net. Evaluate whether to upsell, renegotiate rates, or redirect resources to higher-value work.' } : null,
    direct ? { icon:'📈', title:'Grow Direct Engagements',
      body: 'Direct clients generate ' + fmtN(direct.net) + ' with no deductions. Converting agency clients to direct relationships would significantly improve margins.' } : null,
    ded > 10 ? { icon:'💸', title:'Reduce Deduction Costs',
      body: 'At ' + fmtP(ded) + ', the deduction rate is elevated. Negotiate better terms with agencies and audit any non-standard fees.' } : null,
    topPct > 60 ? { icon:'⚖️', title:'Diversify Revenue Streams',
      body: topCo.name + ' accounts for ' + fmtP(topPct) + ' of net revenue — a significant dependency. Actively develop other company and client relationships.' } : null,
    a.issues.length ? { icon:'🧹', title:'Correct Data Entries',
      body: 'Address the ' + a.issues.length + ' flagged issue(s) — including missing company fields, calculation discrepancies, and spelling errors.' } : null,
    a.worstMonth ? { icon:'📅', title:'Investigate the Weakest Month',
      body: fmtMonth(a.worstMonth.month) + ' recorded the lowest net revenue. Determine whether this was due to seasonal factors, client pauses, or capacity gaps.' } : null,
    { icon:'🔄', title:'Keep the Data Current',
      body: 'Update this sheet monthly. Use the YYYY/MM date format consistently and always fill in the Company column to ensure accurate reporting.' },
  ].filter(Boolean);

  recs.forEach(r => {
    const p = body.appendParagraph('');
    p.editAsText()
     .appendText(r.icon + '  ' + r.title + ':  ').setBold(true).setFontSize(10.5).setForegroundColor(C.navy).setFontFamily('Arial')
     .appendText(r.body).setBold(false).setFontSize(10.5).setForegroundColor(C.dark).setFontFamily('Arial');
    spacer(body, 'sm');
  });
}

// ── Conclusion ────────────────────────────────────────────────
function addConclusion(body, a) {
  sectionHead(body, '11.  Conclusion');

  const margin = a.totalIncoming ? a.totalNet / a.totalIncoming * 100 : 0;
  const ded    = a.totalIncoming ? Math.abs(a.totalOutgoing / a.totalIncoming) * 100 : 0;
  const period = a.months.length
    ? fmtMonth(a.months[0].month) + ' to ' + fmtMonth(a.months[a.months.length - 1].month)
    : 'the reported period';
  const topCo  = a.companies[0];
  const topPct = topCo && a.totalNet ? topCo.net / a.totalNet * 100 : 0;

  para(body,
    'This report covers ' + a.totalRecords + ' transactions across ' + a.months.length +
    ' months (' + period + '). Total net revenue stands at ' + fmtN(a.totalNet) +
    ', reflecting a net margin of ' + fmtP(margin) + '. ' +
    (ded <= 12
      ? 'Deduction levels are within acceptable limits.'
      : 'Deductions at ' + fmtP(ded) + ' require active management to protect margins.'));

  spacer(body, 'sm');

  para(body,
    'Priority actions going forward: ' +
    (topPct > 60 ? 'reduce revenue concentration in ' + (topCo ? topCo.name : 'one company') + ', ' : '') +
    'expand direct client engagements, ' +
    (a.issues.length ? 'resolve ' + a.issues.length + ' data quality issue(s), ' : '') +
    'and sustain momentum with the highest-performing clients.');

  spacer(body, 'lg');
  body.appendHorizontalRule();
  spacer(body, 'sm');

  const footer = body.appendParagraph(
    'Revenue Analysis  ·  ' + SHEET_NAME + '  ·  Generated on ' +
    Utilities.formatDate(a.dateGenerated, Session.getScriptTimeZone(), 'MMMM dd, yyyy  HH:mm z'));
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  footer.editAsText().setFontSize(8.5).setItalic(true).setForegroundColor(C.muted).setFontFamily('Arial');
}

// ============================================================
// PART 8 — PDF EXPORT
// ============================================================

function exportAsPDF(doc) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const ssFile  = DriveApp.getFileById(ss.getId());
  const parents = ssFile.getParents();
  const folder  = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();

  const url      = 'https://docs.google.com/document/d/' + doc.getId() + '/export?format=pdf';
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200)
    throw new Error('PDF export failed (HTTP ' + response.getResponseCode() + ').');

  const pdfBlob = response.getBlob().setName(PDF_NAME);

  const existing = folder.getFilesByName(PDF_NAME);
  while (existing.hasNext()) existing.next().setTrashed(true);

  return folder.createFile(pdfBlob);
}
