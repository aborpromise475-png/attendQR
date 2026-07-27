const lecturerFallbackSessions = [
  { id: "L-101", courseCode: "CSC 305", courseName: "Database Management Systems", date: "2026-07-27", time: "08:00", room: "Lab 2", status: "Active" },
  { id: "L-102", courseCode: "NET 301", courseName: "Computer Networking", date: "2026-07-26", time: "10:00", room: "Room 4", status: "Closed" },
  { id: "L-103", courseCode: "CSC 303", courseName: "Web Development", date: "2026-07-25", time: "12:00", room: "Lab 1", status: "Closed" },
];

function getLecturerName() {
  return localStorage.getItem("attendiqUserName") || "Lecturer";
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

function renderLecturerSummary() {
  const sessions = getSessionStore();
  const attendance = getAttendanceStore();
  const activeSessions = sessions.filter((session) => session.status === "Active");
  const students = new Set(attendance.map((record) => record.studentEmail || record.studentId || record.studentName).filter(Boolean));
  const latestSession = sessions[0];

  document.getElementById("lecturerTitle").textContent = `Lecturer Dashboard - ${getLecturerName()}`;
  document.getElementById("lecturerTopInfo").textContent = localStorage.getItem("attendiqUserEmail") || "lecturer@ums.edu.gh";
  document.getElementById("activeSessionCount").textContent = String(activeSessions.length);
  document.getElementById("attendanceMarkCount").textContent = String(attendance.length);
  document.getElementById("studentCount").textContent = String(students.size);
  document.getElementById("latestSessionLabel").textContent = latestSession ? latestSession.courseCode : "None";
}

function renderSessionTable() {
  const tbody = document.getElementById("sessionTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  getSessionStore().forEach((session) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${session.courseCode} - ${session.courseName}</td>
      <td>${session.date || "-"}</td>
      <td>${session.time || "-"}</td>
      <td>${session.room || "-"}</td>
      <td><span class="status-pill ${session.status === "Active" ? "status-present" : "status-absent"}">${session.status || "Closed"}</span></td>
    `;
    tbody.appendChild(row);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem("attendiqUserRole");
  if (role && role !== "lecturer") {
    window.location.href = "../login.html";
    return;
  }

  renderLecturerSummary();
  renderSessionTable();
});
