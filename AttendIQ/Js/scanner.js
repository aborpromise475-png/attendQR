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
		email: localStorage.getItem("attendiqUserEmail") || "student@htu.edu.gh",
		studentId: localStorage.getItem("attendiqStudentId") || "HTU/2024/001",
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

async function bindCurrentDevice() {
	const currentDeviceId = getDeviceId();
	const student = getCurrentStudent();
	localStorage.setItem("attendiqBoundStudentDeviceId", currentDeviceId);
	refreshBindingStatus();

	try {
		const apiBase = getApiBase();
		await fetchJson(`${apiBase}/api/device/bind`, {
			method: "POST",
			body: JSON.stringify({
				studentEmail: student.email,
				deviceId: currentDeviceId,
			}),
		});
		return true;
	} catch (err) {
		console.warn("Device binding server notice:", err.message);
		return false;
	}
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
let hiddenScanCanvas = null;

function setCameraStatus(badgeText, message) {
	const badge = document.getElementById("cameraStatusBadge");
	const text = document.getElementById("cameraStatusText");
	if (badge) badge.textContent = badgeText;
	if (text) text.textContent = message;
}

async function ensureBarcodeDetector() {
	if (!supportsBarcodeDetector()) return null;
	if (!barcodeDetector) {
		try {
			barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
		} catch (e) {
			barcodeDetector = null;
		}
	}
	return barcodeDetector;
}

function scanCanvasFrame(videoElement) {
	if (typeof jsQR === "undefined") return null;
	if (!hiddenScanCanvas) {
		hiddenScanCanvas = document.createElement("canvas");
	}
	const width = videoElement.videoWidth;
	const height = videoElement.videoHeight;
	if (!width || !height) return null;

	hiddenScanCanvas.width = width;
	hiddenScanCanvas.height = height;
	const ctx = hiddenScanCanvas.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(videoElement, 0, 0, width, height);
	const imageData = ctx.getImageData(0, 0, width, height);
	const code = jsQR(imageData.data, imageData.width, imageData.height, {
		inversionAttempts: "dontInvert",
	});
	return code ? code.data : null;
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
		setCameraStatus("Camera active", "Camera opened. Point it at a QR code.");
		autoScanCameraFrame();
	} catch (error) {
		setCameraStatus("Blocked", error.message || "Unable to open camera.");
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

function parseQrPayload(rawInput) {
	if (!rawInput) return { sessionId: "", signature: "", token: "", apiBase: "" };
	const str = String(rawInput).trim();

	if (str.startsWith("http://") || str.startsWith("https://") || str.includes("scan-qr.html")) {
		try {
			const url = new URL(str, window.location.origin);
			const sessionId = url.searchParams.get("sessionId") || "";
			const signature = url.searchParams.get("sig") || url.searchParams.get("token") || "";
			const apiBase = url.searchParams.get("api") || "";
			return { sessionId, signature, token: signature, apiBase };
		} catch (e) {}
	}

	if (str.startsWith("{")) {
		try {
			const parsed = JSON.parse(str);
			return {
				sessionId: parsed.sessionId || parsed.id || "",
				signature: parsed.signature || parsed.sig || parsed.token || "",
				token: parsed.token || parsed.signature || "",
				apiBase: parsed.apiBase || parsed.api || "",
			};
		} catch (e) {}
	}

	return { sessionId: "", signature: str, token: str, apiBase: "" };
}

async function processScannedQrData(qrText) {
	const tokenInput = document.getElementById("scanTokenInput");
	if (tokenInput) tokenInput.value = qrText;

	const parsed = parseQrPayload(qrText);
	if (parsed.apiBase) {
		localStorage.setItem("attendiqApiBase", parsed.apiBase);
	}

	if (parsed.sessionId) {
		try {
			const apiBase = parsed.apiBase || getApiBase();
			const result = await fetchJson(`${apiBase}/api/sessions/${encodeURIComponent(parsed.sessionId)}`);
			if (result && result.session) {
				localStorage.setItem("attendiqActiveQrSession", JSON.stringify(result.session));
				refreshScanSummary();
			}
		} catch (err) {
			console.warn("Could not hydrate scanned session:", err);
		}
	}
}

async function scanFrameOnce() {
	const preview = document.getElementById("cameraPreview");
	const tokenInput = document.getElementById("scanTokenInput");
	if (!preview || !cameraStream || !tokenInput) {
		setCameraStatus("No camera", "Open the camera first, then scan a code.");
		return null;
	}

	let qrText = null;

	const detector = await ensureBarcodeDetector();
	if (detector) {
		const detections = await detector.detect(preview).catch(() => []);
		if (detections.length > 0 && detections[0].rawValue) {
			qrText = detections[0].rawValue;
		}
	}

	if (!qrText) {
		qrText = scanCanvasFrame(preview);
	}

	if (qrText) {
		setCameraStatus("QR code found", "QR code detected successfully!");
		await processScannedQrData(qrText);
		closeCamera();
		return qrText;
	}

	return null;
}

function autoScanCameraFrame() {
	if (cameraScanTimer) {
		clearInterval(cameraScanTimer);
	}

	cameraScanTimer = setInterval(async () => {
		if (!cameraStream) return;
		await scanFrameOnce();
	}, 800);
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

	const studentLabel = document.getElementById("scanStudentLabel");
	const sessionLabel = document.getElementById("activeSessionLabel");
	const markedLabel = document.getElementById("markedTodayLabel");
	const statusLabel = document.getElementById("scanStatusLabel");
	const resultBadge = document.getElementById("scanResultBadge");
	const resultText = document.getElementById("scanResultText");

	if (studentLabel) studentLabel.textContent = student.name;
	if (sessionLabel) sessionLabel.textContent = active ? active.courseCode : "None";
	if (markedLabel) markedLabel.textContent = String(markedToday);
	if (statusLabel) statusLabel.textContent = active ? "Ready" : "Waiting";
	if (resultBadge) resultBadge.textContent = active ? "Ready" : "Idle";
	if (resultText) {
		resultText.textContent = active
			? `Session ${active.courseCode} (${active.courseName}) is active. Point camera or press Mark Attendance.`
			: "No active QR session loaded yet.";
	}
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
				<td>${record.courseCode} - ${record.courseName || record.course || "Class"}</td>
				<td>${record.sessionId || "-"}</td>
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
		document.getElementById("scanResultText").textContent = "Create or scan a QR session first.";
		return;
	}

	document.getElementById("scanTokenInput").value = active.signature || active.token || active.id;
	document.getElementById("scanResultBadge").textContent = "Token loaded";
	document.getElementById("scanResultText").textContent = "Active session token loaded into form.";
}

async function requestBinding() {
	await bindCurrentDevice();
	document.getElementById("scanResultBadge").textContent = "Bound";
	document.getElementById("scanResultText").textContent = "This phone has been bound for student attendance scans.";
}

async function markAttendanceFromToken() {
	const tokenInput = document.getElementById("scanTokenInput");
	const rawTokenInput = tokenInput ? tokenInput.value.trim() : "";
	const noteInput = document.getElementById("scanNoteInput");
	const note = noteInput ? noteInput.value.trim() : "";
	const student = getCurrentStudent();
	const currentDeviceId = getDeviceId();
	let boundDeviceId = getBoundDeviceId();
	const apiBase = getApiBase();

	if (!rawTokenInput) {
		document.getElementById("scanResultBadge").textContent = "Missing token";
		document.getElementById("scanResultText").textContent = "Scan a QR code or paste the session token/URL first.";
		return;
	}

	const parsed = parseQrPayload(rawTokenInput);
	const params = new URLSearchParams(window.location.search);
	const sessionId = parsed.sessionId || params.get("sessionId") || "";
	const signature = parsed.signature || params.get("sig") || parsed.token || rawTokenInput;

	let active = getActiveSession();

	if ((!active || (sessionId && active.id !== sessionId)) && sessionId) {
		try {
			const result = await fetchJson(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}`);
			if (result && result.session) {
				active = result.session;
				localStorage.setItem("attendiqActiveQrSession", JSON.stringify(active));
			}
		} catch (err) {
			console.warn("Session fetch error:", err);
		}
	}

	if (!sessionId && !active) {
		document.getElementById("scanResultBadge").textContent = "Expired/Missing";
		document.getElementById("scanResultText").textContent = "Session is missing, expired, or invalid.";
		return;
	}

	const targetSessionId = sessionId || active?.id;
	const targetSignature = signature || active?.signature || active?.token;

	if (!boundDeviceId) {
		await bindCurrentDevice();
		boundDeviceId = getBoundDeviceId();
	}

	let studentLoc = { latitude: null, longitude: null };
	try {
		studentLoc = await getCurrentLocation();
	} catch (locErr) {
		console.warn("Geolocation access notice:", locErr.message);
	}

	if (active && active.latitude !== null && active.longitude !== null) {
		if (studentLoc.latitude === null || studentLoc.longitude === null) {
			document.getElementById("scanResultBadge").textContent = "Location required";
			document.getElementById("scanResultText").textContent = "Classroom location verification required. Please allow location access.";
			return;
		}
		const distance = haversineDistanceMeters(active.latitude, active.longitude, studentLoc.latitude, studentLoc.longitude);
		const radius = Number(active.allowedRadiusMeters || 150);
		if (distance > radius) {
			document.getElementById("scanResultBadge").textContent = "Too far";
			document.getElementById("scanResultText").textContent = `You are about ${Math.round(distance)}m away from classroom. Radius limit is ${radius}m.`;
			return;
		}
	}

	try {
		document.getElementById("scanResultBadge").textContent = "Validating...";
		document.getElementById("scanResultText").textContent = "Submitting attendance to server...";

		const result = await fetchJson(`${apiBase}/api/attendance/scan`, {
			method: "POST",
			body: JSON.stringify({
				sessionId: targetSessionId,
				signature: targetSignature,
				studentEmail: student.email,
				studentName: student.name,
				studentId: student.studentId,
				deviceId: currentDeviceId,
				latitude: studentLoc.latitude,
				longitude: studentLoc.longitude,
				note,
			}),
		});

		const record = result.attendance;
		const existing = getAttendanceStore();
		if (!existing.some((r) => r.id === record.id)) {
			existing.push(record);
			saveAttendanceStore(existing);
		}
		document.getElementById("scanResultBadge").textContent = "Marked";
		document.getElementById("scanResultText").textContent = `Attendance successfully marked for ${student.name} in ${record.courseCode}.`;
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
	const fullUrl = window.location.href;

	const tokenInput = document.getElementById("scanTokenInput");
	if (tokenInput) {
		if (signatureFromUrl) tokenInput.value = signatureFromUrl;
		else if (sessionFromUrl) tokenInput.value = sessionFromUrl;
		else if (sessionIdFromUrl) tokenInput.value = fullUrl;
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
