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

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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
    jsonResponse(res, 200, { ok: true, service: 'attendiq-backend' });
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

    const db = loadDb();
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
    saveDb(db);
    jsonResponse(res, 201, { user: { ...user, passwordHash: undefined, passwordSalt: undefined } });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const db = loadDb();
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

    const db = loadDb();
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

    const db = loadDb();
    const binding = upsertBinding(db, studentEmail, body.deviceId);
    saveDb(db);
    jsonResponse(res, 200, { binding });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sessions') {
    const body = await readBody(req);
    if (!body.courseCode || !body.courseName) {
      jsonResponse(res, 400, { error: 'courseCode and courseName are required' });
      return;
    }

    const db = loadDb();
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
    saveDb(db);
    jsonResponse(res, 201, { session });
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/refresh')) {
    const sessionId = pathname.split('/')[3];
    const db = loadDb();
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
    saveDb(db);
    jsonResponse(res, 200, { session });
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/sessions/')) {
    const sessionId = pathname.split('/')[3];
    const db = loadDb();
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) {
      jsonResponse(res, 404, { error: 'Session not found' });
      return;
    }
    jsonResponse(res, 200, { session });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    const db = loadDb();
    const lecturerEmail = searchParams.get('lecturerEmail') || '';
    const sessions = db.sessions
      .filter((session) => !lecturerEmail || normalizeEmail(session.lecturerEmail) === normalizeEmail(lecturerEmail))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    jsonResponse(res, 200, { sessions, active: getActiveSessionForLecturer(db, lecturerEmail) });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/attendance/scan') {
    const body = await readBody(req);
    const db = loadDb();
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
    };

    db.attendanceRecords.push(attendance);
    saveDb(db);
    jsonResponse(res, 200, { attendance });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports/attendance') {
    const db = loadDb();
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
http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  });
}).listen(PORT, () => {
  console.log(`AttendIQ backend listening on http://localhost:${PORT}`);
});
