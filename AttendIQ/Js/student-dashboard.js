const demoAttendanceRecords = [
  { course: "DBMS", code: "CSC 305", date: "2026-05-20", time: "08:12", status: "Present" },
  { course: "Networking", code: "NET 301", date: "2026-05-21", time: "-", status: "Absent" },
  { course: "Web Development", code: "CSC 303", date: "2026-05-22", time: "10:05", status: "Present" },
  { course: "DBMS", code: "CSC 305", date: "2026-05-23", time: "08:09", status: "Present" },
  { course: "Networking", code: "NET 301", date: "2026-05-24", time: "09:58", status: "Present" },
  { course: "Web Development", code: "CSC 303", date: "2026-05-25", time: "-", status: "Absent" },
  { course: "DBMS", code: "CSC 305", date: "2026-05-26", time: "08:11", status: "Present" },
];

function getAttendanceRecords() {
  const storedRecords = JSON.parse(localStorage.getItem("attendiqAttendanceRecords") || "[]");
  if (!Array.isArray(storedRecords) || storedRecords.length === 0) {
    return demoAttendanceRecords;
  }

  const email = localStorage.getItem("attendiqUserEmail");
  const visibleRecords = storedRecords.filter((record) => !email || record.studentEmail === email);

  if (visibleRecords.length === 0) {
    return demoAttendanceRecords;
  }

  return visibleRecords.map((record) => {
    const markedAt = record.markedAt ? new Date(record.markedAt) : null;
    return {
      course: record.courseName || record.courseCode || record.course || "Unknown Course",
      code: record.courseCode || record.code || "-",
      date: markedAt ? markedAt.toISOString().slice(0, 10) : record.date || new Date().toISOString().slice(0, 10),
      time: markedAt
        ? markedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : record.time || "-",
      status: record.status || "Present",
    };
  });
}

const studentCourses = [
  { code: "CSC 305", name: "Database Management Systems", lecturer: "Mr Mensah", schedule: "Mon 8:00 AM" },
  { code: "NET 301", name: "Computer Networking", lecturer: "Dr Arthur", schedule: "Tue 10:00 AM" },
  { code: "CSC 303", name: "Web Development", lecturer: "Mrs Adjei", schedule: "Thu 12:00 PM" },
];

const notificationSeed = [
  { id: 1, text: "Attendance marked successfully for Web Development.", read: false },
  { id: 2, text: "Reminder: Networking class starts tomorrow at 10:00 AM.", read: false },
  { id: 3, text: "Warning: DBMS attendance is close to 75% threshold.", read: true },
];

let currentUser = null;
let activeDispute = null;
let notifications = [];

function initStudentIdentity() {
  const role = localStorage.getItem("attendiqUserRole");
  const email = localStorage.getItem("attendiqUserEmail") || "student@ums.edu.gh";

  if (role && role !== "student") {
    showToast("This dashboard is for students only.", "error");
    window.location.href = "login.html";
    return;
  }

  const savedUsers = JSON.parse(localStorage.getItem("attendiqUsers") || "[]");
  currentUser = savedUsers.find((item) => item.email === email) || {
    name: "Prince",
    email,
    department: "Computer Science",
    studentId: "UMS/2024/001",
    phone: "+233 24 000 0000",
  };

  document.getElementById("studentName").textContent = `Welcome, ${currentUser.name}`;
  document.getElementById("studentMeta").textContent = `${currentUser.department} Department`;
  document.getElementById("studentIdText").textContent = currentUser.studentId || "N/A";
  document.getElementById("studentTopInfo").textContent = currentUser.email;
  document.getElementById("profileNameInput").value = currentUser.name || "";
  document.getElementById("profileEmailInput").value = currentUser.email || "";
  document.getElementById("profilePhoneInput").value = currentUser.phone || "";
  document.getElementById("profileDepartmentInput").value = currentUser.department || "";
}

function setStats(records) {
  const total = records.length;
  const attended = records.filter((r) => r.status === "Present").length;
  const missed = total - attended;
  const rate = total ? Math.round((attended / total) * 100) : 0;
  document.getElementById("attendanceRate").textContent = `${rate}%`;
  document.getElementById("attendedCount").textContent = attended;
  document.getElementById("missedCount").textContent = missed;
}

function calculateClassesNeededToReach75(attended, total) {
  if (total === 0) return 0;
  if ((attended / total) * 100 >= 75) return 0;

  let needed = 0;
  while (((attended + needed) / (total + needed)) * 100 < 75) {
    needed += 1;
  }
  return needed;
}

function renderRiskAlerts() {
  const box = document.getElementById("riskAlertsBox");
  if (!box) return;
  box.innerHTML = "";

  const grouped = {};
  getAttendanceRecords().forEach((record) => {
    if (!grouped[record.course]) grouped[record.course] = { attended: 0, total: 0 };
    grouped[record.course].total += 1;
    if (record.status === "Present") grouped[record.course].attended += 1;
  });

  Object.entries(grouped).forEach(([course, stats]) => {
    const percentage = Math.round((stats.attended / stats.total) * 100);
    const needed = calculateClassesNeededToReach75(stats.attended, stats.total);
    const levelClass = percentage < 75 ? "risk-low" : "risk-good";
    const note =
      needed > 0
        ? `Attend next ${needed} class(es) to reach 75%.`
        : "You're safe. Keep consistency.";

    const card = document.createElement("div");
    card.className = `risk-item ${levelClass}`;
    card.innerHTML = `
      <strong>${course}: ${percentage}%</strong>
      <p>${note}</p>
    `;
    box.appendChild(card);
  });
}

function renderTodayClass() {
  const todayClassText = document.getElementById("todayClassText");
  if (!todayClassText) return;
  const nextClass = studentCourses[0];
  todayClassText.textContent = `${nextClass.name} (${nextClass.code}) with ${nextClass.lecturer} - ${nextClass.schedule}`;
}

function renderTrendBars() {
  const trendBars = document.getElementById("trendBars");
  if (!trendBars) return;
  trendBars.innerHTML = "";

  const byDate = {};
  getAttendanceRecords().forEach((record) => {
    if (!byDate[record.date]) byDate[record.date] = { total: 0, present: 0 };
    byDate[record.date].total += 1;
    if (record.status === "Present") byDate[record.date].present += 1;
  });

  Object.entries(byDate)
    .slice(-6)
    .forEach(([date, stats]) => {
      const percentage = Math.round((stats.present / stats.total) * 100);
      const bar = document.createElement("div");
      bar.className = "trend-row";
      bar.innerHTML = `
        <span>${date}</span>
        <div class="trend-track"><div class="trend-fill" style="width:${percentage}%"></div></div>
        <strong>${percentage}%</strong>
      `;
      trendBars.appendChild(bar);
    });
}

function loadCourseFilter() {
  const filter = document.getElementById("courseFilter");
  if (!filter) return;
  const courses = [...new Set(getAttendanceRecords().map((r) => r.course))];
  courses.forEach((course) => {
    const option = document.createElement("option");
    option.value = course;
    option.textContent = course;
    filter.appendChild(option);
  });
}

function renderAttendanceTable() {
  const filterValue = document.getElementById("courseFilter")?.value || "all";
  const dateFilter = document.getElementById("historyDateFilter")?.value || "";
  const search = (document.getElementById("historySearch")?.value || "").toLowerCase().trim();
  const tbody = document.getElementById("attendanceTableBody");
  const emptyState = document.getElementById("historyEmptyState");
  if (!tbody) return;

  const filtered = getAttendanceRecords().filter((r) => {
    const byCourse = filterValue === "all" || r.course === filterValue;
    const byDate = !dateFilter || r.date === dateFilter;
    const bySearch = !search || r.course.toLowerCase().includes(search);
    return byCourse && byDate && bySearch;
  });
  tbody.innerHTML = "";

  filtered.forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${record.date}</td>
      <td>${record.course}</td>
      <td>${record.time}</td>
      <td><span class="status-pill ${record.status === "Present" ? "status-present" : "status-absent"}">${record.status}</span></td>
      <td>
        ${
          record.status === "Absent"
            ? `<button class="table-action-btn dispute-btn" data-course="${record.course}" data-date="${record.date}">Dispute</button>`
            : "-"
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".dispute-btn").forEach((button) => {
    button.addEventListener("click", () => {
      openDisputeModal(button.dataset.course, button.dataset.date);
    });
  });

  if (emptyState) emptyState.classList.toggle("hidden-step", filtered.length > 0);
  setStats(filtered);
}

function openDisputeModal(course, date) {
  activeDispute = { course, date };
  document.getElementById("disputeMeta").textContent = `${course} on ${date}`;
  document.getElementById("disputeReason").value = "";
  document.getElementById("disputeNote").value = "";
  document.getElementById("disputeModal").classList.remove("hidden-step");
}

function closeDisputeModal() {
  document.getElementById("disputeModal").classList.add("hidden-step");
  activeDispute = null;
}

function submitDispute() {
  const reason = document.getElementById("disputeReason").value;
  const note = document.getElementById("disputeNote").value.trim();

  if (!activeDispute) return;
  if (!reason) {
    showToast("Please select a dispute reason.", "error");
    return;
  }

  const disputes = JSON.parse(localStorage.getItem("attendiqDisputes") || "[]");
  disputes.push({
    ...activeDispute,
    reason,
    note,
    status: "Pending",
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem("attendiqDisputes", JSON.stringify(disputes));
  closeDisputeModal();
  renderDisputesTable();
  showToast("Dispute submitted successfully. Lecturer will review.", "success");
}

function renderDisputesTable() {
  const disputes = JSON.parse(localStorage.getItem("attendiqDisputes") || "[]");
  const tbody = document.getElementById("disputesTableBody");
  const emptyState = document.getElementById("disputeEmptyState");
  if (!tbody) return;
  tbody.innerHTML = "";

  disputes.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.date}</td>
      <td>${d.course}</td>
      <td>${d.reason}</td>
      <td><span class="status-pill">${d.status}</span></td>
    `;
    tbody.appendChild(tr);
  });

  if (emptyState) emptyState.classList.toggle("hidden-step", disputes.length > 0);
}

function renderCourses() {
  const tbody = document.getElementById("coursesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  studentCourses.forEach((course) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${course.code}</td>
      <td>${course.name}</td>
      <td>${course.lecturer}</td>
      <td>${course.schedule}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderNotifications() {
  const list = document.getElementById("notificationsList");
  const filter = document.getElementById("notificationFilter")?.value || "all";
  const emptyState = document.getElementById("notificationEmptyState");
  if (!list) return;
  list.innerHTML = "";
  const filtered = notifications.filter((item) => (filter === "unread" ? !item.read : true));

  filtered.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.read ? "" : "notification-unread";
    li.innerHTML = `
      <span>${item.text}</span>
      ${item.read ? "" : `<button class="table-action-btn" onclick="markNotificationRead(${item.id})">Mark read</button>`}
    `;
    list.appendChild(li);
  });
  if (emptyState) emptyState.classList.toggle("hidden-step", filtered.length > 0);
}

function markNotificationRead(id) {
  notifications = notifications.map((item) => (item.id === id ? { ...item, read: true } : item));
  persistNotifications();
  renderNotifications();
}

function markAllNotificationsRead() {
  notifications = notifications.map((item) => ({ ...item, read: true }));
  persistNotifications();
  renderNotifications();
  showToast("All notifications marked as read.", "success");
}

function clearNotifications() {
  notifications = [];
  persistNotifications();
  renderNotifications();
  showToast("Notifications cleared.", "warning");
}

function persistNotifications() {
  localStorage.setItem("attendiqNotifications", JSON.stringify(notifications));
}

function showSection(section) {
  const titleMap = {
    home: "Dashboard Home",
    scan: "QR Scanner",
    courses: "My Courses",
    history: "Attendance History",
    notifications: "Notifications",
    profile: "Student Profile",
  };

  document.querySelectorAll(".dashboard-section").forEach((el) => el.classList.add("hidden-step"));
  const activeSection = document.getElementById(`section-${section}`);
  if (activeSection) activeSection.classList.remove("hidden-step");
  document.getElementById("sectionTitle").textContent = titleMap[section] || "Dashboard";
}

function toggleMobileNav() {
  const sidebar = document.querySelector(".student-sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("mobile-open");
}

function attachNavEvents() {
  const nav = document.getElementById("studentNav");
  if (!nav) return;
  nav.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      nav.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      showSection(button.dataset.section);
    });
  });
}

function markMockAttendance() {
  setScanState("loading");
  window.setTimeout(() => {
    setScanState("success");
    const status = document.getElementById("scanStatus");
    if (status) status.textContent = "Attendance marked successfully for current class.";
    showToast("Attendance recorded.", "success");
  }, 900);
}

function setScanState(state) {
  const states = ["loading", "success", "expired", "duplicate", "error"];
  states.forEach((key) => {
    const el = document.getElementById(`scan-${key}`);
    if (!el) return;
    el.classList.toggle("hidden-step", key !== state);
  });

  if (state === "expired") showToast("QR code has expired.", "warning");
  if (state === "duplicate") showToast("You already scanned this session.", "warning");
  if (state === "error") showToast("Scanner failed. Try again.", "error");
}

function exportAttendanceCsv() {
  const filterValue = document.getElementById("courseFilter")?.value || "all";
  const dateFilter = document.getElementById("historyDateFilter")?.value || "";
  const search = (document.getElementById("historySearch")?.value || "").toLowerCase().trim();

  const rows = getAttendanceRecords().filter((r) => {
    const byCourse = filterValue === "all" || r.course === filterValue;
    const byDate = !dateFilter || r.date === dateFilter;
    const bySearch = !search || r.course.toLowerCase().includes(search);
    return byCourse && byDate && bySearch;
  });

  const csv = ["Date,Course,Time,Status", ...rows.map((r) => `${r.date},${r.course},${r.time},${r.status}`)].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "attendance-history.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Attendance CSV exported.", "success");
}

function saveProfile() {
  const name = document.getElementById("profileNameInput").value.trim();
  const email = document.getElementById("profileEmailInput").value.trim();
  const phone = document.getElementById("profilePhoneInput").value.trim();
  const department = document.getElementById("profileDepartmentInput").value.trim();

  if (!name || !email) {
    showToast("Name and email are required.", "error");
    return;
  }

  currentUser = { ...currentUser, name, email, phone, department };
  document.getElementById("studentName").textContent = `Welcome, ${currentUser.name}`;
  document.getElementById("studentMeta").textContent = `${currentUser.department || "Department"} Department`;
  document.getElementById("studentTopInfo").textContent = currentUser.email;

  const users = JSON.parse(localStorage.getItem("attendiqUsers") || "[]");
  const idx = users.findIndex((u) => u.email === localStorage.getItem("attendiqUserEmail"));
  if (idx >= 0) users[idx] = { ...users[idx], ...currentUser };
  else users.push({ ...currentUser, role: "student" });
  localStorage.setItem("attendiqUsers", JSON.stringify(users));
  localStorage.setItem("attendiqUserEmail", currentUser.email);
  showToast("Profile updated successfully.", "success");
}

function goToQuickScan() {
  const nav = document.getElementById("studentNav");
  if (nav) {
    nav.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    const scanButton = nav.querySelector("button[data-section='scan']");
    if (scanButton) scanButton.classList.add("active");
  }
  showSection("scan");
}

function logout() {
  localStorage.removeItem("attendiqUserRole");
  localStorage.removeItem("attendiqUserEmail");
  window.location.href = "login.html";
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-out");
    window.setTimeout(() => toast.remove(), 220);
  }, 2400);
}

document.addEventListener("DOMContentLoaded", () => {
  notifications = JSON.parse(localStorage.getItem("attendiqNotifications") || "null") || notificationSeed;
  renderNotifications();
  initStudentIdentity();
  loadCourseFilter();
  renderAttendanceTable();
  renderCourses();
  renderDisputesTable();
  renderTodayClass();
  renderRiskAlerts();
  renderTrendBars();
  attachNavEvents();
  showSection("home");
  setScanState("loading");
  window.setTimeout(() => {
    showToast("Dashboard loaded.", "info");
  }, 300);
});
