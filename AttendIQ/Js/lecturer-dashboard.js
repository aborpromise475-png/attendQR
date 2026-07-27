const lecturerFallbackSessions = [
  { id: "L-101", courseCode: "CSC 305", courseName: "Database Management Systems", date: "2026-07-27", time: "08:00", room: "Lab 2", status: "Active" },
  { id: "L-102", courseCode: "NET 301", courseName: "Computer Networking", date: "2026-07-26", time: "10:00", room: "Room 4", status: "Closed" },
  { id: "L-103", courseCode: "CSC 303", courseName: "Web Development", date: "2026-07-25", time: "12:00", room: "Lab 1", status: "Closed" },
];

const defaultLecturerCourses = [
  { code: "CSC 305", name: "Database Management Systems" },
  { code: "NET 301", name: "Computer Networking" },
  { code: "CSC 303", name: "Web Development" },
  { code: "INF 302", name: "Software Engineering" },
  { code: "CSC 401", name: "Artificial Intelligence" },
];

let watcherPollingTimer = null;

function getDefaultApiBase() {
  return window.location.protocol === "file:" || window.location.origin === "null"
    ? "http://localhost:3000"
    : window.location.origin;
}

function getApiBase() {
  return localStorage.getItem("attendiqApiBase") || getDefaultApiBase();
}

function getLecturerName() {
  return localStorage.getItem("attendiqUserName") || "Lecturer";
}

function getLecturerEmail() {
  return localStorage.getItem("attendiqUserEmail") || "lecturer@htu.edu.gh";
}

function getSessionStore() {
  const stored = JSON.parse(localStorage.getItem("attendiqClassSessions") || "[]");
  return stored.length ? stored : lecturerFallbackSessions;
}

function getAttendanceStore() {
  const stored = JSON.parse(localStorage.getItem("attendiqAttendanceRecords") || "[]");
  return Array.isArray(stored) ? stored : [];
}

function toggleMobileNav() {
  const sidebar = document.querySelector(".student-sidebar");
  if (sidebar) sidebar.classList.toggle("mobile-open");
}

function logout() {
  localStorage.removeItem("attendiqUserRole");
  localStorage.removeItem("attendiqUserEmail");
  localStorage.removeItem("attendiqUserName");
  window.location.href = "../login.html";
}

function getLecturerCourses() {
  const stored = JSON.parse(localStorage.getItem("attendiqLecturerCourses") || "[]");
  if (!stored.length) return defaultLecturerCourses;
  const mergedMap = new Map();
  defaultLecturerCourses.forEach((c) => mergedMap.set(c.code, c));
  stored.forEach((c) => mergedMap.set(c.code, c));
  return Array.from(mergedMap.values());
}

function getSelectedCourse() {
  return localStorage.getItem("attendiqSelectedCourse") || "CSC 305";
}

function setSelectedCourse(courseCode) {
  localStorage.setItem("attendiqSelectedCourse", courseCode);
  const badge = document.getElementById("activeCourseBadge");
  if (badge) badge.textContent = courseCode === "all" ? "All Courses" : courseCode;
}

async function loadLecturerCourses() {
  const select = document.getElementById("activeCourseSelect");
  if (!select) return;

  let courses = getLecturerCourses();
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/courses?lecturerEmail=${encodeURIComponent(getLecturerEmail())}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.courses) && data.courses.length > 0) {
        courses = data.courses;
        localStorage.setItem("attendiqLecturerCourses", JSON.stringify(courses));
      }
    }
  } catch (e) {
    console.warn("Using local courses fallback:", e.message);
  }

  const selected = getSelectedCourse();
  select.innerHTML = '<option value="all">-- All Teaching Courses --</option>';

  courses.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = `${c.code} - ${c.name}`;
    if (c.code === selected) opt.selected = true;
    select.appendChild(opt);
  });

  setSelectedCourse(select.value || "CSC 305");
}

function onLecturerCourseChange() {
  const select = document.getElementById("activeCourseSelect");
  if (!select) return;
  setSelectedCourse(select.value);
  renderLecturerSummary();
  renderSessionTable();
  renderLiveAttendanceWatcher();
}

async function addNewCourseFromDashboard() {
  const codeInput = document.getElementById("newCourseCodeInput");
  const nameInput = document.getElementById("newCourseNameInput");
  const code = (codeInput?.value || "").trim().toUpperCase();
  const name = (nameInput?.value || "").trim();

  if (!code || !name) {
    alert("Please enter both a course code (e.g. CSC 402) and a course name.");
    return;
  }

  const newCourse = { code, name };
  const courses = getLecturerCourses();
  if (!courses.some((c) => c.code === code)) {
    courses.push(newCourse);
    localStorage.setItem("attendiqLecturerCourses", JSON.stringify(courses));
  }

  try {
    const apiBase = getApiBase();
    await fetch(`${apiBase}/api/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newCourse, lecturerEmail: getLecturerEmail() }),
    });
  } catch (e) {}

  if (codeInput) codeInput.value = "";
  if (nameInput) nameInput.value = "";

  await loadLecturerCourses();
  const select = document.getElementById("activeCourseSelect");
  if (select) {
    select.value = code;
    onLecturerCourseChange();
  }

  alert(`Course ${code} (${name}) added successfully!`);
}

function goToGenerateQrForActiveCourse() {
  const selected = getSelectedCourse();
  window.location.href = `generate-qr.html?course=${encodeURIComponent(selected)}`;
}

async function syncLecturerDataFromBackend() {
  try {
    const apiBase = getApiBase();
    const lecturerEmail = getLecturerEmail();

    const [sessionsRes, attendanceRes] = await Promise.all([
      fetch(`${apiBase}/api/sessions?lecturerEmail=${encodeURIComponent(lecturerEmail)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${apiBase}/api/reports/attendance?lecturerEmail=${encodeURIComponent(lecturerEmail)}`).then((r) => (r.ok ? r.json() : null)),
    ]);

    if (sessionsRes && Array.isArray(sessionsRes.sessions)) {
      const existing = JSON.parse(localStorage.getItem("attendiqClassSessions") || "[]");
      const mergedMap = new Map();
      existing.forEach((s) => mergedMap.set(s.id, s));
      sessionsRes.sessions.forEach((s) => mergedMap.set(s.id, s));
      localStorage.setItem("attendiqClassSessions", JSON.stringify(Array.from(mergedMap.values())));
    }

    if (attendanceRes && Array.isArray(attendanceRes.records)) {
      const existing = getAttendanceStore();
      const mergedMap = new Map();
      existing.forEach((r) => mergedMap.set(r.id || `${r.sessionId}-${r.studentEmail}`, r));
      attendanceRes.records.forEach((r) => mergedMap.set(r.id || `${r.sessionId}-${r.studentEmail}`, r));
      localStorage.setItem("attendiqAttendanceRecords", JSON.stringify(Array.from(mergedMap.values())));
    }
  } catch (err) {
    console.warn("Backend lecturer sync notice:", err.message);
  } finally {
    renderLecturerSummary();
    renderSessionTable();
    renderLiveAttendanceWatcher();
  }
}

function renderLecturerSummary() {
  const selectedCourse = getSelectedCourse();
  const allSessions = getSessionStore();
  const allAttendance = getAttendanceStore();

  const sessions = selectedCourse === "all" ? allSessions : allSessions.filter((s) => s.courseCode === selectedCourse);
  const attendance = selectedCourse === "all" ? allAttendance : allAttendance.filter((a) => a.courseCode === selectedCourse);

  const activeSessions = sessions.filter((session) => session.status === "Active" || (session.expiresAt && new Date(session.expiresAt).getTime() > Date.now()));
  const students = new Set(attendance.map((record) => record.studentEmail || record.studentId || record.studentName).filter(Boolean));
  const latestSession = sessions[0];

  const titleEl = document.getElementById("lecturerTitle");
  if (titleEl) titleEl.textContent = `Lecturer Dashboard - ${getLecturerName()}`;

  const topInfo = document.getElementById("lecturerTopInfo");
  if (topInfo) topInfo.textContent = getLecturerEmail();

  const activeCountEl = document.getElementById("activeSessionCount");
  if (activeCountEl) activeCountEl.textContent = String(activeSessions.length);

  const markCountEl = document.getElementById("attendanceMarkCount");
  if (markCountEl) markCountEl.textContent = String(attendance.length);

  const studentCountEl = document.getElementById("studentCount");
  if (studentCountEl) studentCountEl.textContent = String(students.size);

  const latestLabelEl = document.getElementById("latestSessionLabel");
  if (latestLabelEl) latestLabelEl.textContent = latestSession ? latestSession.courseCode : "None";
}

function renderSessionTable() {
  const tbody = document.getElementById("sessionTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const selectedCourse = getSelectedCourse();
  const sessions = getSessionStore().filter((s) => selectedCourse === "all" || s.courseCode === selectedCourse);

  sessions.forEach((session) => {
    const isActive = session.status === "Active" || (session.expiresAt && new Date(session.expiresAt).getTime() > Date.now());
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${session.courseCode} - ${session.courseName}</td>
      <td>${session.date || (session.createdAt ? session.createdAt.slice(0, 10) : "-")}</td>
      <td>${session.time || (session.createdAt ? new Date(session.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-")}</td>
      <td>${session.room || "-"}</td>
      <td><span class="status-pill ${isActive ? "status-present" : "status-absent"}">${isActive ? "Active" : "Closed"}</span></td>
    `;
    tbody.appendChild(row);
  });
}

function renderLiveAttendanceWatcher() {
  const tbody = document.getElementById("watcherTableBody");
  const emptyState = document.getElementById("watcherEmptyState");
  if (!tbody) return;

  const selectedCourse = getSelectedCourse();
  const search = (document.getElementById("watcherStudentSearch")?.value || "").trim().toLowerCase();
  const allRecords = getAttendanceStore();

  const records = allRecords.filter((record) => {
    const byCourse = selectedCourse === "all" || record.courseCode === selectedCourse;
    const studentText = `${record.studentName || ""} ${record.studentId || ""} ${record.studentEmail || ""}`.toLowerCase();
    const bySearch = !search || studentText.includes(search);
    return byCourse && bySearch;
  });

  tbody.innerHTML = "";

  if (records.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  records.slice().reverse().forEach((record) => {
    const timeFormatted = record.markedAt ? new Date(record.markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";
    const row = document.createElement("tr");
    row.className = "watcher-row-highlight";
    row.innerHTML = `
      <td><strong>${record.studentName || "Student"}</strong></td>
      <td><code>${record.studentId || "N/A"}</code></td>
      <td>${record.studentEmail || "-"}</td>
      <td>${timeFormatted}</td>
      <td><span class="status-pill status-present">Checked In</span></td>
      <td><span class="status-pill status-soft">${record.deviceId ? record.deviceId.slice(0, 8) + "..." : "Verified"}</span></td>
      <td>${record.room || "Main Hall"}</td>
    `;
    tbody.appendChild(row);
  });
}

function exportWatcherCsv() {
  const selectedCourse = getSelectedCourse();
  const search = (document.getElementById("watcherStudentSearch")?.value || "").trim().toLowerCase();
  const records = getAttendanceStore().filter((record) => {
    const byCourse = selectedCourse === "all" || record.courseCode === selectedCourse;
    const studentText = `${record.studentName || ""} ${record.studentId || ""} ${record.studentEmail || ""}`.toLowerCase();
    return byCourse && (!search || studentText.includes(search));
  });

  const csvRows = [
    ["Student Name", "Student ID", "Email", "Course Code", "Course Name", "Marked At", "Status", "Room", "Device ID"],
    ...records.map((r) => [
      r.studentName || "",
      r.studentId || "",
      r.studentEmail || "",
      r.courseCode || "",
      r.courseName || "",
      r.markedAt ? new Date(r.markedAt).toLocaleString() : "",
      r.status || "Present",
      r.room || "",
      r.deviceId || "",
    ]),
  ];

  const csv = csvRows.map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `live-attendance-${selectedCourse}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function startLiveWatcherPolling() {
  if (watcherPollingTimer) clearInterval(watcherPollingTimer);
  watcherPollingTimer = setInterval(() => {
    syncLecturerDataFromBackend();
  }, 3000);
}

document.addEventListener("DOMContentLoaded", async () => {
  const role = localStorage.getItem("attendiqUserRole");
  if (role && role !== "lecturer") {
    window.location.href = "../login.html";
    return;
  }

  await loadLecturerCourses();
  renderLecturerSummary();
  renderSessionTable();
  renderLiveAttendanceWatcher();

  syncLecturerDataFromBackend();
  startLiveWatcherPolling();
});
