function getDefaultApiBase() {
	return window.location.protocol === "file:" || window.location.origin === "null"
		? "http://localhost:3000"
		: window.location.origin;
}

function getApiBase() {
	return localStorage.getItem("attendiqApiBase") || getDefaultApiBase();
}

function getAttendanceStore() {
	const stored = JSON.parse(localStorage.getItem("attendiqAttendanceRecords") || "[]");
	return Array.isArray(stored) ? stored : [];
}

function saveAttendanceStore(records) {
	localStorage.setItem("attendiqAttendanceRecords", JSON.stringify(records));
}

function getSessionStore() {
	const stored = JSON.parse(localStorage.getItem("attendiqClassSessions") || "[]");
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

async function syncReportsFromBackend() {
	try {
		const apiBase = getApiBase();
		const lecturerEmail = localStorage.getItem("attendiqUserEmail") || "";
		const response = await fetch(`${apiBase}/api/reports/attendance${lecturerEmail ? `?lecturerEmail=${encodeURIComponent(lecturerEmail)}` : ""}`);
		if (!response.ok) return;
		const data = await response.json();
		if (Array.isArray(data.records)) {
			const existing = getAttendanceStore();
			const mergedMap = new Map();
			existing.forEach((r) => mergedMap.set(r.id || `${r.sessionId}-${r.studentEmail}`, r));
			data.records.forEach((r) => mergedMap.set(r.id || `${r.sessionId}-${r.studentEmail}`, r));
			const merged = Array.from(mergedMap.values());
			saveAttendanceStore(merged);
		}
	} catch (err) {
		console.warn("Backend report sync notice:", err.message);
	}
}

function buildCourseOptions(records) {
	const select = document.getElementById("reportCourseFilter");
	if (!select) return;
	const currentValue = select.value || "all";
	const courses = [...new Set(records.map((record) => record.courseCode).filter(Boolean))];
	select.innerHTML = '<option value="all">All courses</option>';
	courses.forEach((courseCode) => {
		const option = document.createElement("option");
		option.value = courseCode;
		option.textContent = courseCode;
		select.appendChild(option);
	});
	select.value = currentValue;
}

function renderReportSummary(records) {
	const present = records.filter((record) => record.status === "Present").length;
	const absent = records.filter((record) => record.status === "Absent").length;
	const uniqueStudents = new Set(records.map((record) => record.studentEmail || record.studentId || record.studentName).filter(Boolean)).size;

	const totalEl = document.getElementById("reportTotalCount");
	const presentEl = document.getElementById("reportPresentCount");
	const absentEl = document.getElementById("reportAbsentCount");
	const studentEl = document.getElementById("reportStudentCount");

	if (totalEl) totalEl.textContent = String(records.length);
	if (presentEl) presentEl.textContent = String(present);
	if (absentEl) absentEl.textContent = String(absent);
	if (studentEl) studentEl.textContent = String(uniqueStudents);
}

function getFilteredRecords() {
	const records = getAttendanceStore();
	const courseFilter = document.getElementById("reportCourseFilter")?.value || "all";
	const studentFilter = (document.getElementById("reportStudentFilter")?.value || "").trim().toLowerCase();
	const statusFilter = document.getElementById("reportStatusFilter")?.value || "all";
	const startDate = document.getElementById("reportStartDate")?.value || "";
	const endDate = document.getElementById("reportEndDate")?.value || "";

	return records.filter((record) => {
		const recordDate = (record.markedAt || record.createdAt || "").slice(0, 10);
		const byCourse = courseFilter === "all" || record.courseCode === courseFilter;
		const byStudent = !studentFilter || `${record.studentName || ""} ${record.studentEmail || ""}`.toLowerCase().includes(studentFilter);
		const byStatus = statusFilter === "all" || record.status === statusFilter;
		const byStart = !startDate || recordDate >= startDate;
		const byEnd = !endDate || recordDate <= endDate;
		return byCourse && byStudent && byStatus && byStart && byEnd;
	});
}

function renderReportTable() {
	const tbody = document.getElementById("reportTableBody");
	if (!tbody) return;

	const records = getFilteredRecords();
	tbody.innerHTML = "";

	records.forEach((record) => {
		const row = document.createElement("tr");
		row.innerHTML = `
			<td>${record.markedAt ? new Date(record.markedAt).toLocaleDateString() : "-"}</td>
			<td>${record.courseCode} - ${record.courseName || record.course || "Course"}</td>
			<td>${record.studentName || record.studentEmail || "Student"}</td>
			<td>${record.sessionId || "-"}</td>
			<td><span class="status-pill status-present">${record.status || "Present"}</span></td>
			<td>${record.markedAt ? new Date(record.markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
		`;
		tbody.appendChild(row);
	});

	renderReportSummary(records);
}

function exportReportCsv() {
	const records = getFilteredRecords();
	const csvRows = [
		["Date", "Course", "Student", "Session", "Status", "Marked At"],
		...records.map((record) => [
			record.markedAt ? new Date(record.markedAt).toLocaleDateString() : "",
			`${record.courseCode} - ${record.courseName || record.course || ""}`,
			record.studentName || record.studentEmail || "",
			record.sessionId || "",
			record.status || "Present",
			record.markedAt ? new Date(record.markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
		]),
	];

	const csv = csvRows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "attendiq-attendance-report.csv";
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function resetReportFilters() {
	document.getElementById("reportCourseFilter").value = "all";
	document.getElementById("reportStudentFilter").value = "";
	document.getElementById("reportStatusFilter").value = "all";
	document.getElementById("reportStartDate").value = "";
	document.getElementById("reportEndDate").value = "";
	renderReportTable();
}

document.addEventListener("DOMContentLoaded", () => {
	const role = localStorage.getItem("attendiqUserRole");
	if (role && role !== "lecturer") {
		window.location.href = "../login.html";
		return;
	}

	const records = getAttendanceStore();
	buildCourseOptions(records);
	renderReportTable();

	syncReportsFromBackend().finally(() => {
		const updatedRecords = getAttendanceStore();
		buildCourseOptions(updatedRecords);
		renderReportTable();
	});

	const activeSession = getSessionStore()[0];
	if (activeSession) {
		const reportTitle = document.querySelector(".student-topbar h1");
		if (reportTitle) reportTitle.textContent = `Attendance Reports - ${activeSession.courseCode}`;
	}
});
