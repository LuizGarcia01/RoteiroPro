/**
 * RoteiroPro — Backend API v6
 * Express + better-sqlite3
 */
const express  = require('express');
const Database = require('better-sqlite3');
const path     = require('path');

const app     = express();
const PORT    = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'roteiro.db');

// ── DB ──────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Minha Empresa',
    plan TEXT NOT NULL DEFAULT 'Pro',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO organizations (id,name,plan) VALUES (1,'Minha Empresa','Pro');
  CREATE TABLE IF NOT EXISTS routes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id            INTEGER NOT NULL DEFAULT 1,
    name              TEXT    NOT NULL,
    mode              TEXT    NOT NULL CHECK(mode IN ('fast','economic','balanced')),
    total_distance_km REAL    DEFAULT 0,
    estimated_time_min REAL   DEFAULT 0,
    stop_count        INTEGER DEFAULT 0,
    savings_pct       REAL    DEFAULT 0,
    start_lat         REAL,
    start_lon         REAL,
    status            TEXT    DEFAULT 'ativa' CHECK(status IN ('ativa','concluida','cancelada')),
    notes             TEXT    DEFAULT '',
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(id)
  );
  CREATE TABLE IF NOT EXISTS stops (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id        INTEGER NOT NULL,
    sequence_order  INTEGER NOT NULL,
    label           TEXT, barcode TEXT, company TEXT,
    address TEXT, postal_code TEXT, delivery_status TEXT,
    lat REAL NOT NULL, lon REAL NOT NULL,
    dist_from_prev REAL DEFAULT 0,
    accumulated_km REAL DEFAULT 0,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL DEFAULT 1,
    filename TEXT NOT NULL,
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_routes_org  ON routes(org_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_stops_route ON stops(route_id,sequence_order);
`);

// ── Statements ───────────────────────────────
const Q = {
  getCfg:    db.prepare('SELECT value FROM config WHERE key=?'),
  getAllCfg:  db.prepare('SELECT key,value FROM config'),
  setCfg:    db.prepare(`INSERT INTO config(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`),
  delCfg:    db.prepare('DELETE FROM config WHERE key=?'),

  insertRoute:  db.prepare(`INSERT INTO routes(name,mode,total_distance_km,estimated_time_min,stop_count,savings_pct,start_lat,start_lon,notes)
                  VALUES(@name,@mode,@totalDistanceKm,@estimatedTimeMin,@stopCount,@savingsPct,@startLat,@startLon,@notes)`),
  insertStop:   db.prepare(`INSERT INTO stops(route_id,sequence_order,label,barcode,company,address,postal_code,delivery_status,lat,lon,dist_from_prev,accumulated_km)
                  VALUES(@routeId,@order,@label,@barcode,@company,@address,@postalCode,@status,@lat,@lon,@distFromPrev,@accumulated)`),
  allRoutes:    db.prepare('SELECT * FROM routes ORDER BY created_at DESC'),
  routeById:    db.prepare('SELECT * FROM routes WHERE id=?'),
  stopsByRoute: db.prepare('SELECT * FROM stops WHERE route_id=? ORDER BY sequence_order'),
  updStatus:    db.prepare('UPDATE routes SET status=? WHERE id=?'),
  updNotes:     db.prepare('UPDATE routes SET notes=? WHERE id=?'),
  delRoute:     db.prepare('DELETE FROM routes WHERE id=?'),

  cntRoutes:  db.prepare('SELECT COUNT(*) as n FROM routes'),
  sumDist:    db.prepare('SELECT COALESCE(SUM(total_distance_km),0) as v FROM routes'),
  sumStops:   db.prepare('SELECT COALESCE(SUM(stop_count),0) as v FROM routes'),
  avgSav:     db.prepare('SELECT COALESCE(AVG(savings_pct),0) as v FROM routes WHERE savings_pct>0'),
  cntUploads: db.prepare('SELECT COUNT(*) as n FROM uploads'),
  byMode:     db.prepare('SELECT mode,COUNT(*) as n FROM routes GROUP BY mode'),
  last7:      db.prepare(`SELECT date(created_at) as day,COUNT(*) as n,SUM(total_distance_km) as dist
                FROM routes WHERE created_at>=date('now','-7 days') GROUP BY date(created_at) ORDER BY day`),
  recent8:    db.prepare('SELECT * FROM routes ORDER BY created_at DESC LIMIT 8'),
  insUpload:  db.prepare('INSERT INTO uploads(filename,total_rows,valid_rows,error_rows) VALUES(@filename,@totalRows,@validRows,@errorRows)'),
  recUploads: db.prepare('SELECT * FROM uploads ORDER BY created_at DESC LIMIT 10'),
};

const txSave = db.transaction((route, stops) => {
  const { lastInsertRowid: routeId } = Q.insertRoute.run(route);
  for (const s of stops) Q.insertStop.run({ ...s, routeId });
  return routeId;
});

// ── Middleware ────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${req.method} ${req.path}`);
  next();
});

// ── Config API ────────────────────────────────
app.get('/api/config', (req, res) => {
  try {
    const cfg = Object.fromEntries(Q.getAllCfg.all().map(r => [r.key, r.value]));
    res.json(cfg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/:key', (req, res) => {
  try {
    const row = Q.getCfg.get(req.params.key);
    res.json({ key: req.params.key, value: row?.value ?? null, exists: !!row });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', (req, res) => {
  try {
    const entries = Object.entries(req.body);
    if (!entries.length) return res.status(400).json({ error: 'Sem dados' });
    for (const [k, v] of entries) Q.setCfg.run(k, String(v));
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/config/:key', (req, res) => {
  try { Q.delCfg.run(req.params.key); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Stats API ─────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    res.json({
      totalRoutes:     Q.cntRoutes.get().n,
      totalDistanceKm: parseFloat(Q.sumDist.get().v).toFixed(1),
      totalStops:      Q.sumStops.get().v,
      avgSavingsPct:   parseFloat(Q.avgSav.get().v).toFixed(1),
      totalUploads:    Q.cntUploads.get().n,
      routesByMode:    Q.byMode.all(),
      routesLast7:     Q.last7.all(),
      recentRoutes:    Q.recent8.all(),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Routes API ────────────────────────────────
app.get('/api/routes', (req, res) => {
  try { res.json(Q.allRoutes.all()); } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/routes/:id', (req, res) => {
  try {
    const route = Q.routeById.get(req.params.id);
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });
    res.json({ ...route, stops: Q.stopsByRoute.all(req.params.id) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/routes', (req, res) => {
  const { name, mode, totalDistanceKm, estimatedTimeMin, stopCount, savingsPct,
          startLat, startLon, notes, stops } = req.body;
  if (!name || !mode || !stops?.length)
    return res.status(400).json({ error: 'Campos obrigatórios: name, mode, stops' });
  try {
    const routeId = txSave(
      { name, mode, totalDistanceKm, estimatedTimeMin, stopCount,
        savingsPct, startLat, startLon, notes: notes||'' },
      stops.map(s => ({
        order: s.order, label: s.id||s.label, barcode: s.barcode,
        company: s.company, address: s.address, postalCode: s.postalCode,
        status: s.status, lat: s.lat, lon: s.lon,
        distFromPrev: s.distFromPrev, accumulated: s.accumulated,
      }))
    );
    res.json({ success: true, routeId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/routes/:id/status', (req, res) => {
  if (!['ativa','concluida','cancelada'].includes(req.body.status))
    return res.status(400).json({ error: 'Status inválido' });
  try { Q.updStatus.run(req.body.status, req.params.id); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/routes/:id/notes', (req, res) => {
  try { Q.updNotes.run(req.body.notes||'', req.params.id); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/routes/:id', (req, res) => {
  try { Q.delRoute.run(req.params.id); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Uploads API ───────────────────────────────
app.post('/api/uploads', (req, res) => {
  const { filename, totalRows, validRows, errorRows } = req.body;
  try {
    Q.insUpload.run({ filename, totalRows, validRows: validRows||0, errorRows: errorRows||0 });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/uploads', (req, res) => {
  try { res.json(Q.recUploads.all()); } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Start ─────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║  🚚  RoteiroPro — API v6         ║');
  console.log(`║  URL : http://localhost:${PORT}       ║`);
  console.log(`║  DB  : ${path.basename(DB_PATH)}                 ║`);
  console.log('╚══════════════════════════════════╝\n');
});
process.on('SIGINT', () => { db.close(); process.exit(0); });
