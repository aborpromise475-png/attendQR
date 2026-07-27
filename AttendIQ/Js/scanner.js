function createId() {
	return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `A-${Math.random().toString(36).slice(2, 10)}`;
}

function getDefaultApiBase() {
	return window.location.protocol === "file:" || window.location.origin === "null"
		? "http://localhost:3000"
		: window.location.origin;
}

function getActiveSession() {
	const active = JSON.parse(localStorage.getItem("attendiqActiveQrSession") || "null");
	if (!active) return null;
	if (Date.now() > new Date(active.expiresAt).getTime()) return null;
	return active;
}

function getCurrentStudent() {
	return {
		name: localStorage.getItem("attendiqUserName") || "Student",
		email: localStorage.getItem("attendiqUserEmail") || "student@ums.edu.gh",
		studentId: "UMS/2024/001",
	};
}

function getAttendanceStore() {
	const stored = JSON.parse(localStorage.getItem("attendiqAttendanceRecords") || "[]");
	return Array.isArray(stored) ? stored : [];
}

function supportsCameraScan() {
	return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function supportsBarcodeDetector() {
	return typeof window.BarcodeDetector !== "undefined";
}

function getApiBase() {
	return localStorage.getItem("attendiqApiBase") || new URLSearchParams(window.location.search).get("api") || getDefaultApiBase();
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

function getDeviceId() {
	let deviceId = localStorage.getItem("attendiqDeviceId");
	if (!deviceId) {
		deviceId = createId();
		localStorage.setItem("attendiqDeviceId", deviceId);
	}
	return deviceId;
}

function getBoundDeviceId() {
	return localStorage.getItem("attendiqBoundStudentDeviceId") || "";
}

function bindCurrentDevice() {
	localStorage.setItem("attendiqBoundStudentDeviceId", getDeviceId());
	refreshBindingStatus();
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
	const earthRadius = 6371000;
	const toRadians = (value) => (value * Math.PI) / 180;
	const deltaLat = toRadians(lat2 - lat1);
	const deltaLon = toRadians(lon2 - lon1);
	const startLat = toRadians(lat1);
	const endLat = toRadians(lat2);
	const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLon / 2) ** 2;
	return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function getCurrentLocation() {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error("Geolocation unavailable"));
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
			},
			() => reject(new Error("Location permission denied")),
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	});
}

function saveAttendanceStore(records) {
	localStorage.setItem("attendiqAttendanceRecords", JSON.stringify(records));
}

let cameraStream = null;
let cameraScanTimer = null;
let barcodeDetector = null;

function setCameraStatus(badgeText, message) {
	const badge = document.getElementById("cameraStatusBadge");
	const text = document.getElementById("cameraStatusText");
	if (badge) badge.textContent = badgeText;
	if (text) text.textContent = message;
}

async function ensureBarcodeDetector() {
	if (!supportsBarcodeDetector()) return null;
	if (!barcodeDetector) {
		barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
	}
	return barcodeDetector;
}

async function openCamera() {
	const preview = document.getElementById("cameraPreview");
	if (!preview) return;

	if (!supportsCameraScan()) {
		setCameraStatus("Unavailable", "This browser does not support camera access.");
		return;
	}

	try {
		closeCamera();
		const stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: { ideal: "environment" } },
			audio: false,
		});
		cameraStream = stream;
		preview.srcObject = stream;
		await preview.play();
		setCameraStatus("Camera on", "Camera opened. Point it at a QR code.");
		autoScanCameraFrame();
	} catch (error) {
		setCameraStatus("Blocked", error.message || "Unable to open the camera.");
	}
}

function closeCamera() {
	if (cameraScanTimer) {
		clearInterval(cameraScanTimer);
		cameraScanTimer = null;
	}
	if (cameraStream) {
		cameraStream.getTracks().forEach((track) => track.stop());
		cameraStream = null;
	}
	const preview = document.getElementById("cameraPreview");
	if (preview) preview.srcObject = null;
	setCameraStatus("Camera off", "Open the camera to scan a QR code automatically.");
}

async function scanFrameOnce() {
	const preview = document.getElementById("cameraPreview");
	const tokenInput = document.getElementById("scanTokenInput");
	if (!preview || !cameraStream || !tokenInput) {
		setCameraStatus("No camera", "Open the camera first, then scan a code.");
		return;
	}

	const detector = await ensureBarcodeDetector();
	if (!detector) {
		setCameraStatus("Unsupported", "This browser cannot decode QR codes directly. Try Chrome or Edge.");
		return;
	}

	const detections = await detector.detect(preview).catch(() => []);
	if (detections.length > 0 && detections[0].rawValue) {
		tokenInput.value = detections[0].rawValue;
		setCameraStatus("QR found", "The QR token has been loaded into the form.");
		closeCamera();
	}
}

function autoScanCameraFrame() {
	if (cameraScanTimer) {
		clearInterval(cameraScanTimer);
	}

	cameraScanTimer = setInterval(async () => {
		if (!cameraStream) return;
		await scanFrameOnce();
	}, 1200);
}

function toggleMobileNav() {
	const sidebar = document.querySelector(".student-sidebar");
	if (sidebar) sidebar.classList.toggle("mobile-open");
}

function logout() {
	localStorage.removeItem("attendiqUserRole");
	localStorage.removeItem("attendiqUserEmail");
	localStorage.removeItem("attendiqUserName");
	localStorage.removeItem("attendiqBoundStudentDeviceId");
	window.location.href = "../login.html";
}

function refreshBindingStatus() {
	const status = document.getElementById("bindingStatus");
	const deviceLabel = document.getElementById("deviceIdLabel");
	const boundId = getBoundDeviceId();
	const currentId = getDeviceId();
	if (deviceLabel) deviceLabel.textContent = currentId.slice(0, 12);
	if (status) status.textContent = boundId === currentId ? "Device bound" : "Not bound";
}

async function hydrateSessionFromUrl() {
	const params = new URLSearchParams(window.location.search);
	const sessionId = params.get("sessionId");
	if (!sessionId) return null;

	try {
		const apiBase = getApiBase();
		const result = await fetchJson(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}`);
		const active = result.session;
		localStorage.setItem("attendiqActiveQrSession", JSON.stringify(active));
		return active;
	} catch (error) {
		const badge = document.getElementById("scanResultBadge");
		const text = document.getElementById("scanResultText");
		if (badge) badge.textContent = "Unavailable";
		if (text) text.textContent = error.message;
		return null;
	}
}

function refreshScanSummary() {
	const active = getActiveSession();
	const student = getCurrentStudent();
	const records = getAttendanceStore().filter((record) => record.studentEmail === student.email);
	const markedToday = records.filter((record) => record.markedAt && record.markedAt.startsWith(new Date().toISOString().slice(0, 10))).length;

	document.getElementById("scanStudentLabel").textContent = student.name;
	document.getElementById("activeSessionLabel").textContent = active ? active.courseCode : "None";
	document.getElementById("markedTodayLabel").textContent = String(markedToday);
	document.getElementById("scanStatusLabel").textContent = active ? "Ready" : "Waiting";
	document.getElementById("scanResultBadge").textContent = active ? "Ready" : "Idle";
	document.getElementById("scanResultText").textContent = active
		? `Session ${active.courseCode} is available for attendance. The device must be bound and inside the classroom radius.`
		: "No active QR session is available right now.";
	refreshBindingStatus();
	renderScanHistory();
}

function renderScanHistory() {
	const tbody = document.getElementById("scanHistoryBody");
	if (!tbody) return;
	tbody.innerHTML = "";

	const student = getCurrentStudent();
	getAttendanceStore()
		.filter((record) => record.studentEmail === student.email)
		.slice()
		.reverse()
		.forEach((record) => {
			const row = document.createElement("tr");
			row.innerHTML = `
				<td>${record.courseCode} - ${record.courseName}</td>
				<td>${record.sessionId}</td>
				<td>${record.markedAt ? new Date(record.markedAt).toLocaleString() : "-"}</td>
				<td><span class="status-pill status-present">${record.status || "Present"}</span></td>
			`;
			tbody.appendChild(row);
		});
}

function fillActiveToken() {
	const active = getActiveSession();
	if (!active) {
		document.getElementById("scanResultBadge").textContent = "No session";
		document.getElementById("scanResultText").textContent = "Create a QR session first.";
		return;
	}

	document.getElementById("scanTokenInput").value = active.token;
	document.getElementById("scanResultBadge").textContent = "Token loaded";
	document.getElementById("scanResultText").textContent = "The active session token has been filled into the form.";
}

function requestBinding() {
	bindCurrentDevice();
	document.getElementById("scanResultBadge").textContent = "Bound";
	document.getElementById("scanResultText").textContent = "This phone has been bound for attendance scans.";
}

async function verifyLocationForSession(active) {
	if (!active || active.latitude === null || active.longitude === null) {
		return { ok: true, message: "No classroom location was set for this session." };
	}

	const currentLocation = await getCurrentLocation();
	const distance = haversineDistanceMeters(active.latitude, active.longitude, currentLocation.latitude, currentLocation.longitude);
	const radius = Number(active.allowedRadiusMeters || 150);
	if (distance > radius) {
		return {
			ok: false,
			message: `You are about ${Math.round(distance)}m away from the approved location. Move closer to class.`,
		};
	}
	return { ok: true, message: `Location verified within ${Math.round(distance)}m.` };
}

async function markAttendanceFromToken() {
	const sessionId = new URLSearchParams(window.location.search).get("sessionId") || "";
	const signature = new URLSearchParams(window.location.search).get("sig") || "";
	const token = document.getElementById("scanTokenInput").value.trim();
	const note = document.getElementById("scanNoteInput").value.trim();
	const active = getActiveSession();
	const student = getCurrentStudent();
	const currentDeviceId = getDeviceId();
	const boundDeviceId = getBoundDeviceId();
	const apiBase = getApiBase();

	if (!token) {
		document.getElementById("scanResultBadge").textContent = "Missing token";
		document.getElementById("scanResultText").textContent = "Paste the QR token before validating.";
		return;
	}

	if (!sessionId && !active) {
		document.getElementById("scanResultBadge").textContent = "Expired";
		document.getElementById("scanResultText").textContent = "The active session has expired or is unavailable.";
		return;
	}

	if (active && token !== active.token) {
		document.getElementById("scanResultBadge").textContent = "Invalid";
		document.getElementById("scanResultText").textContent = "The token does not match the active QR session.";
		return;
	}

	if (boundDeviceId && boundDeviceId !== currentDeviceId) {
		document.getElementById("scanResultBadge").textContent = "Device blocked";
		document.getElementById("scanResultText").textContent = "This phone is not the bound attendance device for the student.";
		return;
	}

	const locationCheck = await verifyLocationForSession(active || { latitude: null, longitude: null, allowedRadiusMeters: 150 });
	if (!locationCheck.ok) {
		document.getElementById("scanResultBadge").textContent = "Too far";
		document.getElementById("scanResultText").textContent = locationCheck.message;
		return;
	}

	try {
		const result = await fetchJson(`${apiBase}/api/attendance/scan`, {
			method: "POST",
			body: JSON.stringify({
				sessionId: sessionId || active.id,
				signature: signature || active.signature,
				studentEmail: student.email,
				studentName: student.name,
				studentId: student.studentId,
				deviceId: currentDeviceId,
				latitude: active?.latitude ?? null,
				longitude: active?.longitude ?? null,
				note,
			}),
		});

		const record = result.attendance;
		const existing = getAttendanceStore();
		existing.push(record);
		saveAttendanceStore(existing);
		if (!boundDeviceId) bindCurrentDevice();
		document.getElementById("scanResultBadge").textContent = "Marked";
		document.getElementById("scanResultText").textContent = `Attendance marked for ${student.name} in ${record.courseCode}. ${locationCheck.message}`;
		refreshScanSummary();
	} catch (error) {
		document.getElementById("scanResultBadge").textContent = "Rejected";
		document.getElementById("scanResultText").textContent = error.message;
	}
}

document.addEventListener("DOMContentLoaded", () => {
	const role = localStorage.getItem("attendiqUserRole");
	if (role && role !== "student" && role !== "lecturer") {
		window.location.href = "../login.html";
		return;
	}

	const sessionFromUrl = new URLSearchParams(window.location.search).get("session");
	const sessionIdFromUrl = new URLSearchParams(window.location.search).get("sessionId");
	const signatureFromUrl = new URLSearchParams(window.location.search).get("sig");
	if (sessionFromUrl) {
		const tokenInput = document.getElementById("scanTokenInput");
		if (tokenInput) tokenInput.value = sessionFromUrl;
	}
	if (sessionIdFromUrl || signatureFromUrl) {
		const tokenInput = document.getElementById("scanTokenInput");
		if (tokenInput && signatureFromUrl) tokenInput.value = signatureFromUrl;
	}

	hydrateSessionFromUrl()
		.catch(() => null)
		.finally(() => {
			refreshBindingStatus();
			refreshScanSummary();
			setCameraStatus("Camera off", "Open the camera to scan a QR code automatically.");
		});
});

window.addEventListener("beforeunload", closeCamera);
