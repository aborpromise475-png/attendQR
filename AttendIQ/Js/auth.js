let selectedRole = "student";
let registerRole = "student";
let registerStep = 1;

const demoUsers = {
  student: { email: "student@htu.edu.gh", password: "student123" },
  lecturer: { email: "lecturer@htu.edu.gh", password: "lecturer123" },
};

function isHtuStudentEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith("@htu.edu.gh");
}

function getDefaultApiBase() {
  return window.location.protocol === "file:" || window.location.origin === "null"
    ? "http://localhost:3000"
    : window.location.origin;
}

function getApiBase() {
  return localStorage.getItem("attendiqApiBase") || getDefaultApiBase();
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

function getOrCreateFieldError(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return null;

  const existing = document.getElementById(`${inputId}-error`);
  if (existing) return existing;

  const msg = document.createElement("small");
  msg.id = `${inputId}-error`;
  msg.className = "field-error";
  input.insertAdjacentElement("afterend", msg);
  return msg;
}

function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  const error = getOrCreateFieldError(inputId);
  if (!input || !error) return;

  if (!message) {
    input.classList.remove("input-invalid");
    error.style.display = "none";
    error.textContent = "";
    return;
  }

  input.classList.add("input-invalid");
  error.textContent = message;
  error.style.display = "block";
}

function clearFieldErrors() {
  const fields = ["name", "email", "password", "confirm", "department", "studentId"];
  fields.forEach((id) => setFieldError(id, ""));
}

function showError(message) {
  const errorBox = document.getElementById("error");
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.style.display = "block";
}

function hideError() {
  const errorBox = document.getElementById("error");
  if (!errorBox) return;
  errorBox.style.display = "none";
}

function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.classList.toggle("is-visible", isHidden);
  button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
}

function updateActiveButton(groupSelector, activeButton) {
  const buttons = document.querySelectorAll(groupSelector);
  buttons.forEach((btn) => btn.classList.remove("active"));
  activeButton.classList.add("active");
}

function setRole(role, button) {
  selectedRole = role;
  updateActiveButton(".role-toggle button", button);
  hideError();
  clearFieldErrors();

  const label = document.getElementById("demo-label");
  const creds = document.getElementById("demo-creds");
  const emailInput = document.getElementById("email");

  if (emailInput) {
    emailInput.placeholder = role === "student" ? "student@htu.edu.gh" : "lecturer@htu.edu.gh";
  }

  if (label && creds) {
    label.textContent = `Demo - ${role[0].toUpperCase()}${role.slice(1)}`;
    creds.textContent = `${demoUsers[role].email} / ${demoUsers[role].password}`;
  }
}

function autofill() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  if (!emailInput || !passwordInput) return;

  emailInput.value = demoUsers[selectedRole].email;
  passwordInput.value = demoUsers[selectedRole].password;
  hideError();
}

async function handleLogin() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  clearFieldErrors();

  if (!email || !password) {
    if (!email) setFieldError("email", "Email is required.");
    if (!password) setFieldError("password", "Password is required.");
    showError("Please enter both email and password.");
    return;
  }

  // HTU Domain Restriction for Students
  if (selectedRole === "student" && !isHtuStudentEmail(email)) {
    setFieldError("email", "Student email must end with @htu.edu.gh");
    showError("Only official Ho Technical University emails (@htu.edu.gh) can sign in as a student.");
    return;
  }

  // First try local demo account fallback if running purely offline
  if (email === demoUsers[selectedRole].email && password === demoUsers[selectedRole].password) {
    localStorage.setItem("attendiqUserRole", selectedRole);
    localStorage.setItem("attendiqUserEmail", email);
    localStorage.setItem("attendiqUserName", selectedRole === "student" ? "Kwame Mensah" : "Dr. Edwin Kwami");
    if (selectedRole === "student") localStorage.setItem("attendiqStudentId", "HTU/2024/001");
    hideError();
    if (selectedRole === "student") {
      window.location.href = "student-dashboard.html";
      return;
    }
    window.location.href = "Pages/lec-dashboard.html";
    return;
  }

  // Attempt API Login
  try {
    const apiBase = getApiBase();
    const result = await fetchJson(`${apiBase}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password, role: selectedRole }),
    });

    const user = result.user;
    localStorage.setItem("attendiqUserRole", user.role);
    localStorage.setItem("attendiqUserEmail", user.email);
    localStorage.setItem("attendiqUserName", user.name);
    if (user.studentId) localStorage.setItem("attendiqStudentId", user.studentId);
    hideError();

    if (user.role === "student") {
      window.location.href = "student-dashboard.html";
      return;
    }
    window.location.href = "Pages/lec-dashboard.html";
    return;
  } catch (err) {
    // Check saved local users as fallback
    const savedUsers = JSON.parse(localStorage.getItem("attendiqUsers") || "[]");
    const found = savedUsers.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.role === selectedRole);
    if (found) {
      localStorage.setItem("attendiqUserRole", found.role);
      localStorage.setItem("attendiqUserEmail", found.email);
      localStorage.setItem("attendiqUserName", found.name);
      if (found.studentId) localStorage.setItem("attendiqStudentId", found.studentId);
      hideError();
      if (found.role === "student") {
        window.location.href = "student-dashboard.html";
        return;
      }
      window.location.href = "Pages/lec-dashboard.html";
      return;
    }

    showError(err.message || "Invalid credentials. Please try again.");
  }
}

function setRegisterRole(role, button) {
  registerRole = role;
  updateActiveButton(".role-toggle button", button);
  hideError();
  clearFieldErrors();

  const studentIdGroup = document.getElementById("studentIdGroup");
  const emailInput = document.getElementById("email");
  const studentEmailHint = document.getElementById("studentEmailHint");

  if (studentIdGroup) {
    studentIdGroup.style.display = role === "student" ? "block" : "none";
  }

  if (emailInput) {
    emailInput.placeholder = role === "student" ? "student@htu.edu.gh" : "lecturer@htu.edu.gh";
  }

  if (studentEmailHint) {
    studentEmailHint.innerHTML =
      role === "student"
        ? "Students must register with an official <strong>@htu.edu.gh</strong> email."
        : "Official institutional email for lecturers.";
  }
}

function updateRegisterStepUI() {
  const step1 = document.getElementById("registerStep1");
  const step2 = document.getElementById("registerStep2");
  const stepText = document.getElementById("stepText");

  if (!step1 || !step2 || !stepText) return;

  if (registerStep === 1) {
    step1.classList.remove("hidden-step");
    step2.classList.add("hidden-step");
    stepText.textContent = "Step 1 of 2 - Account details";
    const bar = document.getElementById("stepProgressBar");
    if (bar) bar.style.width = "50%";
  } else {
    step1.classList.add("hidden-step");
    step2.classList.remove("hidden-step");
    stepText.textContent = "Step 2 of 2 - Academic details";
    const bar = document.getElementById("stepProgressBar");
    if (bar) bar.style.width = "100%";
  }
}

function goToRegisterStep2() {
  const name = document.getElementById("name")?.value.trim();
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;
  const confirm = document.getElementById("confirm")?.value;

  clearFieldErrors();

  if (!name || !email || !password || !confirm) {
    if (!name) setFieldError("name", "Full name is required.");
    if (!email) setFieldError("email", "Email is required.");
    if (!password) setFieldError("password", "Password is required.");
    if (!confirm) setFieldError("confirm", "Please confirm password.");
    showError("Please complete all Step 1 fields.");
    return;
  }

  if (registerRole === "student" && !isHtuStudentEmail(email)) {
    setFieldError("email", "Students must use an official @htu.edu.gh email.");
    showError("Only official Ho Technical University emails (@htu.edu.gh) can register as a student.");
    return;
  }

  if (password.length < 8) {
    setFieldError("password", "Use at least 8 characters.");
    showError("Password must be at least 8 characters.");
    return;
  }

  if (password !== confirm) {
    setFieldError("confirm", "Passwords do not match.");
    showError("Passwords do not match.");
    return;
  }

  hideError();
  registerStep = 2;
  updateRegisterStepUI();
}

function goToRegisterStep1() {
  hideError();
  registerStep = 1;
  updateRegisterStepUI();
}

async function handleRegister() {
  const name = document.getElementById("name")?.value.trim();
  const email = document.getElementById("email")?.value.trim();
  const department = document.getElementById("department")?.value.trim();
  const studentId = document.getElementById("studentId")?.value.trim();
  const password = document.getElementById("password")?.value;
  const confirm = document.getElementById("confirm")?.value;

  clearFieldErrors();

  if (!name || !email || !department || !password || !confirm) {
    if (!name) setFieldError("name", "Full name is required.");
    if (!email) setFieldError("email", "Email is required.");
    if (!department) setFieldError("department", "Select a department.");
    if (!password) setFieldError("password", "Password is required.");
    if (!confirm) setFieldError("confirm", "Please confirm password.");
    showError("Please complete all required fields.");
    return;
  }

  if (registerRole === "student" && !isHtuStudentEmail(email)) {
    setFieldError("email", "Students must use an official @htu.edu.gh email.");
    showError("Only official Ho Technical University emails (@htu.edu.gh) can register as a student.");
    return;
  }

  if (registerRole === "student" && !studentId) {
    setFieldError("studentId", "Student ID is required for students.");
    showError("Student ID is required for student registration.");
    return;
  }

  if (password.length < 8) {
    setFieldError("password", "Use at least 8 characters.");
    showError("Password must be at least 8 characters.");
    return;
  }

  if (password !== confirm) {
    setFieldError("confirm", "Passwords do not match.");
    showError("Passwords do not match.");
    return;
  }

  // Send registration request to API
  try {
    const apiBase = getApiBase();
    await fetchJson(`${apiBase}/api/auth/register`, {
      method: "POST",
      body: JSON.stringify({
        role: registerRole,
        name,
        email,
        password,
        department,
        studentId: registerRole === "student" ? studentId : null,
      }),
    });

    const users = JSON.parse(localStorage.getItem("attendiqUsers") || "[]");
    users.push({
      role: registerRole,
      name,
      email,
      department,
      studentId: registerRole === "student" ? studentId : null,
    });
    localStorage.setItem("attendiqUsers", JSON.stringify(users));

    hideError();
    alert("Registration successful! You can now sign in with your credentials.");
    window.location.href = "login.html";
  } catch (err) {
    showError(err.message || "Registration failed. Please try again.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("registerStep1")) {
    updateRegisterStepUI();
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    const onRegisterPage = !!document.getElementById("registerStep1");
    const onLoginPage = !!document.getElementById("demo-creds");

    if (onRegisterPage) {
      event.preventDefault();
      if (registerStep === 1) goToRegisterStep2();
      else handleRegister();
      return;
    }

    if (onLoginPage) {
      event.preventDefault();
      handleLogin();
    }
  });
});
