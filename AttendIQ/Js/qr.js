const qrDemoCourses = [
	{ code: "CSC 305", name: "Database Management Systems" },
	{ code: "NET 301", name: "Computer Networking" },
	{ code: "CSC 303", name: "Web Development" },
];

let countdownTimer = null;
let activeServerSession = null;

function getDefaultApiBase() {
	return window.location.protocol === "file:" || window.location.origin === "null"
		? "http://localhost:3000"
		: window.location.origin;
}

function getApiBase() {
	const input = document.getElementById("apiBaseInput");
	const apiBase = input?.value.trim() || localStorage.getItem("attendiqApiBase") || getDefaultApiBase();
	return apiBase.replace(/\/$/, "");
}

function setApiBase(apiBase) {
	const normalized = String(apiBase || "").trim().replace(/\/$/, "") || getDefaultApiBase();
	localStorage.setItem("attendiqApiBase", normalized);
	const input = document.getElementById("apiBaseInput");
	if (input) input.value = normalized;
}

function getFrontendOrigin() {
	return window.location.origin;
}

function createId() {
	return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `S-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionStore() {
	const stored = JSON.parse(localStorage.getItem("attendiqClassSessions") || "[]");
	return Array.isArray(stored) ? stored : [];
}

function getSessionLocation() {
	const latitude = Number(localStorage.getItem("attendiqSessionLatitude") || "");
	const longitude = Number(localStorage.getItem("attendiqSessionLongitude") || "");
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	return { latitude, longitude };
}

function useCurrentLocation() {
	if (!navigator.geolocation) {
		window.alert("Geolocation is not available in this browser.");
		return;
	}

	navigator.geolocation.getCurrentPosition(
		(position) => {
			localStorage.setItem("attendiqSessionLatitude", String(position.coords.latitude));
			localStorage.setItem("attendiqSessionLongitude", String(position.coords.longitude));
			updateLocationSummary();
		},
		() => window.alert("Location permission is required to bind the QR session."),
		{ enableHighAccuracy: true, timeout: 10000 }
	);
}

function clearSessionLocation() {
	localStorage.removeItem("attendiqSessionLatitude");
	localStorage.removeItem("attendiqSessionLongitude");
	updateLocationSummary();
}

function updateLocationSummary() {
	const locationMeta = document.getElementById("sessionLocationMeta");
	const location = getSessionLocation();
	if (!locationMeta) return;
	locationMeta.textContent = location
		? `Bound location: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
		: "No location bound yet.";
}

async function fetchJson(url, options = {}) {
	const response = await fetch(url, {
		headers: { "Content-Type": "application/json", ...(options.headers || {}) },
		...options,
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload.error || "Request failed");
	}
	return payload;
}

function saveSessionStore(sessions) {
	localStorage.setItem("attendiqClassSessions", JSON.stringify(sessions));
}

function getActiveSession() {
	const active = JSON.parse(localStorage.getItem("attendiqActiveQrSession") || "null");
	if (!active) return null;
	if (Date.now() > new Date(active.expiresAt).getTime()) return null;
	return active;
}

function setActiveSession(session) {
	localStorage.setItem("attendiqActiveQrSession", JSON.stringify(session));
}

function renderCourseOptions() {
	const select = document.getElementById("courseSelect");
	if (!select) return;
	select.innerHTML = "";

	qrDemoCourses.forEach((course, index) => {
		const option = document.createElement("option");
		option.value = course.code;
		option.textContent = `${course.code} - ${course.name}`;
		if (index === 0) option.selected = true;
		select.appendChild(option);
	});
}

function renderHistory() {
	const tbody = document.getElementById("sessionHistoryBody");
	if (!tbody) return;
	tbody.innerHTML = "";

	const sessions = getSessionStore();
	sessions.slice().reverse().forEach((session) => {
		const row = document.createElement("tr");
		row.innerHTML = `
			<td>${session.courseCode} - ${session.courseName}</td>
			<td>${session.date || "-"}</td>
			<td>${session.time || "-"}</td>
			<td>${session.durationMinutes || 30} min</td>
			<td>${session.token.slice(0, 12)}...</td>
		`;
		tbody.appendChild(row);
	});
}

function updateSummary(session) {
	const sessionStatusLabel = document.getElementById("sessionStatusLabel");
	const countdown = document.getElementById("sessionCountdown");
	const tokenLengthLabel = document.getElementById("tokenLengthLabel");
	const roomLabel = document.getElementById("roomLabel");
	const qrFrame = document.getElementById("qrCodeFrame");
	const meta = document.getElementById("sessionMeta");
	const status = document.getElementById("generateStatus");
	const locationMeta = document.getElementById("sessionLocationMeta");

	if (!session) {
		if (sessionStatusLabel) sessionStatusLabel.textContent = "Idle";
		if (countdown) countdown.textContent = "--:--";
		if (tokenLengthLabel) tokenLengthLabel.textContent = "0 chars";
		if (roomLabel) roomLabel.textContent = "N/A";
		if (qrFrame) qrFrame.innerHTML = "<p class='qr-code-url'>Generate a session to display the QR code.</p>";
		if (meta) meta.textContent = "The QR code expires when the session ends.";
		updateLocationSummary();
		if (locationMeta) locationMeta.textContent = "No location bound yet.";
		if (status) status.textContent = "No session yet";
		return;
	}

	const remainingMs = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
	const remainingMinutes = Math.floor(remainingMs / 60000);
	const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

	if (sessionStatusLabel) sessionStatusLabel.textContent = remainingMs > 0 ? "Active" : "Expired";
	if (countdown) countdown.textContent = `${String(remainingMinutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
	if (tokenLengthLabel) tokenLengthLabel.textContent = `${session.token.length} chars`;
	if (roomLabel) roomLabel.textContent = session.room || "N/A";
	if (qrFrame && typeof QRCode !== "undefined") {
		const qrPayload = session.scanUrl || `${window.location.origin}${window.location.pathname.replace("generate-qr.html", "scan-qr.html")}?sessionId=${encodeURIComponent(session.id)}&sig=${encodeURIComponent(session.signature || session.token)}`;
		qrFrame.innerHTML = "";
		new QRCode(qrFrame, {
			text: qrPayload,
			width: 210,
			height: 210,
			colorDark: "#0f172a",
			colorLight: "#ffffff",
			correctLevel: QRCode.CorrectLevel.M,
		});
		const urlNote = document.createElement("p");
		urlNote.className = "qr-code-url";
		urlNote.textContent = qrPayload;
		qrFrame.appendChild(urlNote);
	}
	if (meta) meta.textContent = `${session.courseCode} - ${session.courseName} | ${session.date} ${session.time} | ${session.room}`;
	if (locationMeta) {
		locationMeta.textContent =
			session.latitude !== null && session.longitude !== null
				? `Bound location: ${Number(session.latitude).toFixed(5)}, ${Number(session.longitude).toFixed(5)} | Radius ${session.allowedRadiusMeters || 150}m`
				: "No location bound yet.";
	}
	updateLocationSummary();
	if (status) status.textContent = remainingMs > 0 ? "Live session" : "Expired";
}

function refreshCountdown() {
	updateSummary(getActiveSession());
}

async function generateSession() {
	const courseCode = document.getElementById("courseSelect")?.value || qrDemoCourses[0].code;
	const courseName = qrDemoCourses.find((course) => course.code === courseCode)?.name || courseCode;
	const date = document.getElementById("sessionDate")?.value || new Date().toISOString().slice(0, 10);
	const time = document.getElementById("sessionStart")?.value || new Date().toTimeString().slice(0, 5);
	const durationMinutes = Number(document.getElementById("sessionDuration")?.value || 15);
	const room = document.getElementById("roomInput")?.value.trim() || "Main Hall";
	const allowedRadiusMeters = Number(document.getElementById("allowedRadius")?.value || 150);
	const location = getSessionLocation();
	const lecturerEmail = localStorage.getItem("attendiqUserEmail") || "lecturer@htu.edu.gh";
	const lecturerName = localStorage.getItem("attendiqUserName") || "Lecturer";
	const apiBase = getApiBase();

	setApiBase(apiBase);

	const payload = {
		lecturerEmail,
		lecturerName,
		courseCode,
		courseName,
		room,
		latitude: location?.latitude ?? null,
		longitude: location?.longitude ?? null,
		allowedRadiusMeters,
		frontendOrigin: getFrontendOrigin(),
		apiBase,
	};

	const result = await fetchJson(`${apiBase}/api/sessions`, {
		method: "POST",
		body: JSON.stringify(payload),
	});

	activeServerSession = result.session;
	const session = {
		id: result.session.id,
		courseCode: result.session.courseCode,
		courseName: result.session.courseName,
		date,
		time,
		room,
		latitude: result.session.latitude,
		longitude: result.session.longitude,
		allowedRadiusMeters: result.session.allowedRadiusMeters,
		durationMinutes: 15,
		token: result.session.signature,
		signature: result.session.signature,
		scanUrl: result.session.scanUrl,
		createdAt: result.session.createdAt,
		expiresAt: result.session.expiresAt,
		status: result.session.status,
	};

	const sessions = getSessionStore();
	sessions.push(session);
	saveSessionStore(sessions);
	setActiveSession(session);
	updateSummary(session);
	renderHistory();

	const status = document.getElementById("generateStatus");
	if (status) status.textContent = "QR session created";

	if (countdownTimer) clearInterval(countdownTimer);
	countdownTimer = window.setInterval(refreshCountdown, 1000);
}

function refreshActiveSession() {
	const active = getActiveSession();
	if (!active) {
		generateSession().catch((error) => alert(error.message));
		return;
	}

	const apiBase = getApiBase();
	fetchJson(`${apiBase}/api/sessions/${active.id}/refresh?frontendOrigin=${encodeURIComponent(getFrontendOrigin())}&api=${encodeURIComponent(apiBase)}`, {
		method: "POST",
	})
		.then((result) => {
			const refreshed = {
				...active,
				signature: result.session.signature,
				scanUrl: result.session.scanUrl,
				expiresAt: result.session.expiresAt,
			};
			const sessions = getSessionStore().map((session) => (session.id === active.id ? refreshed : session));
			saveSessionStore(sessions);
			setActiveSession(refreshed);
			updateSummary(refreshed);
			renderHistory();
		})
		.catch((error) => alert(error.message));
}

function copySessionToken() {
	const active = getActiveSession();
	if (!active) {
		window.alert("Create a session first.");
		return;
	}

	const copyPromise = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(active.scanUrl || active.token) : Promise.resolve();
	copyPromise.then(() => {
		const status = document.getElementById("generateStatus");
		if (status) status.textContent = "Token copied";
	});
}

function toggleMobileNav() {
	const sidebar = document.querySelector(".student-sidebar");
	if (sidebar) sidebar.classList.toggle("mobile-open");
}

document.addEventListener("DOMContentLoaded", () => {
	renderCourseOptions();
	renderHistory();

	const today = new Date().toISOString().slice(0, 10);
	const sessionDate = document.getElementById("sessionDate");
	if (sessionDate) sessionDate.value = today;
	const sessionStart = document.getElementById("sessionStart");
	if (sessionStart) sessionStart.value = new Date().toTimeString().slice(0, 5);
	const sessionDuration = document.getElementById("sessionDuration");
	if (sessionDuration) sessionDuration.value = "15";
	const apiBaseInput = document.getElementById("apiBaseInput");
	if (apiBaseInput) apiBaseInput.value = getApiBase();
	updateLocationSummary();

	const active = getActiveSession();
	updateSummary(active);

	if (active) {
		if (countdownTimer) clearInterval(countdownTimer);
		countdownTimer = window.setInterval(refreshCountdown, 1000);
	}
});
