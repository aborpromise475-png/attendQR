const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.ATTENDIQ_SECRET || 'attendiq-demo-secret-change-me';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const FRONTEND_ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });
    console.log('Render PostgreSQL Database initialized.');
  } catch (err) {
    console.warn('pg module unavailable or database connection pending, using file DB:', err.message);
  }
}

async function initPostgresSchema() {
  if (!pgPool) return;
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    try {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pgPool.query(sql);
      console.log('PostgreSQL database schema verified.');
    } catch (err) {
      console.error('PostgreSQL schema migration notice:', err.message);
    }
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], sessions: [], deviceBindings: [], attendanceRecords: [] }, null, 2));
  }
}

function loadDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    deviceBindings: Array.isArray(parsed.deviceBindings) ? parsed.deviceBindings : [],
    attendanceRecords: Array.isArray(parsed.attendanceRecords) ? parsed.attendanceRecords : [],
  };
}

async function loadDbAsync() {
  if (pgPool) {
    try {
      const [uRes, sRes, bRes, aRes] = await Promise.all([
        pgPool.query('SELECT id, role, name, email, password_hash AS "passwordHash", password_salt AS "passwordSalt", department, student_id AS "studentId" FROM users'),
        pgPool.query('SELECT id, lecturer_email AS "lecturerEmail", lecturer_name AS "lecturerName", course_code AS "courseCode", course_name AS "courseName", room, latitude, longitude, allowed_radius_meters AS "allowedRadiusMeters", signature, scan_url AS "scanUrl", created_at AS "createdAt", expires_at AS "expiresAt", status FROM class_sessions'),
        pgPool.query('SELECT id, student_email AS "studentEmail", device_id AS "deviceId", bound_at AS "boundAt" FROM device_bindings'),
        pgPool.query('SELECT id, session_id AS "sessionId", course_code AS "courseCode", course_name AS "courseName", lecturer_email AS "lecturerEmail", student_email AS "studentEmail", student_name AS "studentName", student_id AS "studentId", device_id AS "deviceId", room, marked_at AS "markedAt", status, latitude, longitude, note FROM attendance_records'),
      ]);
      return {
        users: uRes.rows,
        sessions: sRes.rows,
        deviceBindings: bRes.rows,
        attendanceRecords: aRes.rows,
      };
    } catch (err) {
      console.error('PostgreSQL query notice, using local file DB:', err.message);
    }
  }
  return loadDb();
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function saveDbAsync(db, type, record) {
  saveDb(db);
  if (!pgPool || !type || !record) return;

  try {
    if (type === 'user') {
      await pgPool.query(
        `INSERT INTO users (id, role, name, email, password_hash, password_salt, department, student_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [record.id, record.role, record.name, record.email, record.passwordHash || '', record.passwordSalt || '', record.department || '', record.studentId || '']
      );
    } else if (type === 'session') {
      await pgPool.query(
        `INSERT INTO class_sessions (id, lecturer_email, lecturer_name, course_code, course_name, room, latitude, longitude, allowed_radius_meters, signature, scan_url, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at, signature = EXCLUDED.signature`,
        [record.id, record.lecturerEmail, record.lecturerName, record.courseCode, record.courseName, record.room, record.latitude, record.longitude, record.allowedRadiusMeters, record.signature, record.scanUrl, record.expiresAt, record.status || 'Active']
      );
    } else if (type === 'binding') {
      await pgPool.query(
        `INSERT INTO device_bindings (id, student_email, device_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_email) DO UPDATE SET device_id = EXCLUDED.device_id, bound_at = CURRENT_TIMESTAMP`,
        [record.id || createId(), record.studentEmail, record.deviceId]
      );
    } else if (type === 'attendance') {
      await pgPool.query(
        `INSERT INTO attendance_records (id, session_id, course_code, course_name, lecturer_email, student_email, student_name, student_id, device_id, room, status, latitude, longitude, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (session_id, student_email) DO NOTHING`,
        [record.id, record.sessionId, record.courseCode, record.courseName, record.lecturerEmail, record.studentEmail, record.studentName, record.studentId, record.deviceId, record.room, record.status || 'Present', record.latitude, record.longitude, record.note || '']
      );
    }
  } catch (err) {
    console.error('PostgreSQL sync notice:', err.message);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

function resolveStaticFile(pathname) {
  const safePath = pathname === '/' ? '/login.html' : pathname;
  const filePath = path.normalize(path.join(FRONTEND_ROOT, safePath));
  if (!filePath.startsWith(FRONTEND_ROOT)) return null;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return filePath;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const attempt = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
}

function signSession(session) {
  const payload = `${session.id}.${session.expiresAt}.${session.courseCode}`;
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function verifySessionSignature(session, signature) {
  if (!session || !signature) return false;
  const expected = signSession(session);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(String(signature), 'hex'));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function isSessionActive(session) {
  return session && new Date(session.expiresAt).getTime() > Date.now();
}

function buildScanUrl(frontendOrigin, apiBase, sessionId, signature) {
  const origin = String(frontendOrigin || '').replace(/\/$/, '');
  const base = String(apiBase || '').replace(/\/$/, '');
  return `${origin}/Pages/scan-qr.html?sessionId=${encodeURIComponent(sessionId)}&sig=${encodeURIComponent(signature)}&api=${encodeURIComponent(base)}`;
}

function getActiveSessionForLecturer(db, lecturerEmail) {
  const normalized = normalizeEmail(lecturerEmail);
  const sessions = db.sessions
    .filter((session) => !normalized || normalizeEmail(session.lecturerEmail) === normalized)
    .filter(isSessionActive)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  return sessions[0] || null;
}

function getBinding(db, studentEmail) {
  return db.deviceBindings.find((binding) => normalizeEmail(binding.studentEmail) === normalizeEmail(studentEmail)) || null;
}

function upsertBinding(db, studentEmail, deviceId) {
  const normalized = normalizeEmail(studentEmail);
  const index = db.deviceBindings.findIndex((binding) => normalizeEmail(binding.studentEmail) === normalized);
  const record = {
    id: createId(),
    studentEmail: normalized,
    deviceId,
    boundAt: new Date().toISOString(),
  };

  if (index >= 0) db.deviceBindings[index] = record;
  else db.deviceBindings.push(record);
  return record;
}

function filterAttendance(db, query) {
  return db.attendanceRecords.filter((record) => {
    const recordDate = record.markedAt ? record.markedAt.slice(0, 10) : '';
    const byStudent = !query.studentEmail || normalizeEmail(record.studentEmail) === normalizeEmail(query.studentEmail);
    const byCourse = !query.courseCode || record.courseCode === query.courseCode;
    const byStatus = !query.status || record.status === query.status;
    const byStart = !query.from || recordDate >= query.from;
    const byEnd = !query.to || recordDate <= query.to;
    return byStudent && byCourse && byStatus && byStart && byEnd;
  });
}

function jsonResponse(res, statusCode, payload) {
  sendJson(res, statusCode, payload);
}

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = parsedUrl;

  if (req.method === 'GET') {
    const staticFile = resolveStaticFile(pathname);
    if (staticFile) {
      sendFile(res, staticFile);
      return;
    }
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    jsonResponse(res, 200, { ok: true, service: 'attendiq-backend', database: pgPool ? 'postgresql' : 'json-file' });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const role = body.role === 'lecturer' ? 'lecturer' : 'student';
    if (!email || !body.password || !body.name) {
      jsonResponse(res, 400, { error: 'name, email, and password are required' });
      return;
    }

    if (role === 'student' && !email.endsWith('@htu.edu.gh')) {
      jsonResponse(res, 400, { error: 'Students must register with an official Ho Technical University email (@htu.edu.gh)' });
      return;
    }

    const db = await loadDbAsync();
    if (db.users.some((user) => normalizeEmail(user.email) === email)) {
      jsonResponse(res, 409, { error: 'User already exists' });
      return;
    }

    const { salt, hash } = hashPassword(body.password);
    const user = {
      id: createId(),
      role,
      name: body.name,
      email,
      passwordSalt: salt,
      passwordHash: hash,
      department: body.department || '',
      studentId: role === 'student' ? body.studentId || '' : '',
    };
    db.users.push(user);
    await saveDbAsync(db, 'user', user);
    jsonResponse(res, 201, { user: { ...user, passwordHash: undefined, passwordSalt: undefined } });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const reqRole = body.role || 'student';
    if (reqRole === 'student' && !email.endsWith('@htu.edu.gh')) {
      jsonResponse(res, 400, { error: 'Student login requires an official @htu.edu.gh email address' });
      return;
    }

    const db = await loadDbAsync();
    const user = db.users.find((item) => normalizeEmail(item.email) === email);
    if (!user) {
      jsonResponse(res, 401, { error: 'Invalid credentials' });
      return;
    }

    if (user.passwordHash && user.passwordSalt) {
      const valid = verifyPassword(body.password, user.passwordSalt, user.passwordHash);
      if (!valid) {
        jsonResponse(res, 401, { error: 'Invalid credentials' });
        return;
      }
    }

    jsonResponse(res, 200, {
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        department: user.department,
        studentId: user.studentId,
      },
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/device/bind') {
    const studentEmail = normalizeEmail(searchParams.get('studentEmail'));
    if (!studentEmail) {
      jsonResponse(res, 400, { error: 'studentEmail is required' });
      return;
    }

    const db = await loadDbAsync();
    const binding = getBinding(db, studentEmail);
    jsonResponse(res, 200, { binding });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/device/bind') {
    const body = await readBody(req);
    const studentEmail = normalizeEmail(body.studentEmail);
    if (!studentEmail || !body.deviceId) {
      jsonResponse(res, 400, { error: 'studentEmail and deviceId are required' });
      return;
    }

    const db = await loadDbAsync();
    const binding = upsertBinding(db, studentEmail, body.deviceId);
    await saveDbAsync(db, 'binding', binding);
    jsonResponse(res, 200, { binding });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sessions') {
    const body = await readBody(req);
    if (!body.courseCode || !body.courseName) {
      jsonResponse(res, 400, { error: 'courseCode and courseName are required' });
      return;
    }

    const db = await loadDbAsync();
    const session = {
      id: createId(),
      lecturerEmail: normalizeEmail(body.lecturerEmail || ''),
      lecturerName: body.lecturerName || '',
      courseCode: body.courseCode,
      courseName: body.courseName,
      room: body.room || 'Main Hall',
      latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null,
      longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null,
      allowedRadiusMeters: Number(body.allowedRadiusMeters || 150),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      status: 'Active',
    };
    session.signature = signSession(session);
    const frontendOrigin = body.frontendOrigin || body.origin || '';
    const apiBase = body.apiBase || `http://${req.headers.host}`;
    session.scanUrl = buildScanUrl(frontendOrigin, apiBase, session.id, session.signature);
    db.sessions.push(session);
    await saveDbAsync(db, 'session', session);
    jsonResponse(res, 201, { session });
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/refresh')) {
    const sessionId = pathname.split('/')[3];
    const db = await loadDbAsync();
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) {
      jsonResponse(res, 404, { error: 'Session not found' });
      return;
    }

    session.expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    session.signature = signSession(session);
    const apiBase = searchParams.get('api') || `http://${req.headers.host}`;
    const frontendOrigin = searchParams.get('frontendOrigin') || '';
    session.scanUrl = buildScanUrl(frontendOrigin, apiBase, session.id, session.signature);
    await saveDbAsync(db, 'session', session);
    jsonResponse(res, 200, { session });
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/sessions/')) {
    const sessionId = pathname.split('/')[3];
    const db = await loadDbAsync();
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) {
      jsonResponse(res, 404, { error: 'Session not found' });
      return;
    }
    jsonResponse(res, 200, { session });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    const db = await loadDbAsync();
    const lecturerEmail = searchParams.get('lecturerEmail') || '';
    const sessions = db.sessions
      .filter((session) => !lecturerEmail || normalizeEmail(session.lecturerEmail) === normalizeEmail(lecturerEmail))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    jsonResponse(res, 200, { sessions, active: getActiveSessionForLecturer(db, lecturerEmail) });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/attendance/scan') {
    const body = await readBody(req);
    const db = await loadDbAsync();
    const session = db.sessions.find((item) => item.id === body.sessionId);
    if (!session) {
      jsonResponse(res, 404, { error: 'Session not found' });
      return;
    }

    if (!isSessionActive(session)) {
      jsonResponse(res, 400, { error: 'Session expired' });
      return;
    }

    if (!verifySessionSignature(session, body.signature)) {
      jsonResponse(res, 400, { error: 'Invalid session signature' });
      return;
    }

    const studentEmail = normalizeEmail(body.studentEmail);
    const deviceId = String(body.deviceId || '').trim();
    if (!studentEmail || !deviceId) {
      jsonResponse(res, 400, { error: 'studentEmail and deviceId are required' });
      return;
    }

    const binding = getBinding(db, studentEmail);
    if (!binding) {
      jsonResponse(res, 403, { error: 'Device is not bound for this student', code: 'DEVICE_NOT_BOUND' });
      return;
    }

    if (binding.deviceId !== deviceId) {
      jsonResponse(res, 403, { error: 'This device is not the bound device for the student', code: 'DEVICE_MISMATCH' });
      return;
    }

    if (session.latitude !== null && session.longitude !== null) {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        jsonResponse(res, 400, { error: 'Location is required for this session', code: 'LOCATION_REQUIRED' });
        return;
      }

      const distance = distanceMeters(session.latitude, session.longitude, latitude, longitude);
      if (distance > Number(session.allowedRadiusMeters || 150)) {
        jsonResponse(res, 403, {
          error: 'You are outside the allowed classroom radius',
          code: 'OUTSIDE_RADIUS',
          distanceMeters: Math.round(distance),
          allowedRadiusMeters: Number(session.allowedRadiusMeters || 150),
        });
        return;
      }
    }

    const alreadyMarked = db.attendanceRecords.some((record) => record.sessionId === session.id && normalizeEmail(record.studentEmail) === studentEmail);
    if (alreadyMarked) {
      jsonResponse(res, 409, { error: 'Attendance already marked for this session', code: 'DUPLICATE' });
      return;
    }

    const attendance = {
      id: createId(),
      sessionId: session.id,
      courseCode: session.courseCode,
      courseName: session.courseName,
      lecturerEmail: session.lecturerEmail,
      studentEmail,
      studentName: body.studentName || '',
      studentId: body.studentId || '',
      deviceId,
      room: session.room,
      markedAt: new Date().toISOString(),
      status: 'Present',
      latitude: Number(body.latitude) || null,
      longitude: Number(body.longitude) || null,
      note: body.note || '',
    };

    db.attendanceRecords.push(attendance);
    await saveDbAsync(db, 'attendance', attendance);
    jsonResponse(res, 200, { attendance });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports/attendance') {
    const db = await loadDbAsync();
    const records = filterAttendance(db, {
      studentEmail: searchParams.get('studentEmail') || '',
      courseCode: searchParams.get('courseCode') || '',
      status: searchParams.get('status') || '',
      from: searchParams.get('from') || '',
      to: searchParams.get('to') || '',
    });
    jsonResponse(res, 200, { records });
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
}

ensureDataFile();
initPostgresSchema().catch(() => null);

http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  });
}).listen(PORT, () => {
  console.log(`AttendIQ backend listening on http://localhost:${PORT}`);
});
