let selectedRole = "student";
let registerRole = "student";
let registerStep = 1;

const demoUsers = {
  student: { email: "student@ums.edu.gh", password: "student123" },
  lecturer: { email: "lecturer@ums.edu.gh", password: "lecturer123" },
};

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

  const label = document.getElementById("demo-label");
  const creds = document.getElementById("demo-creds");
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

function handleLogin() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  clearFieldErrors();

  if (!email || !password) {
    if (!email) setFieldError("email", "Email is required.");
    if (!password) setFieldError("password", "Password is required.");
    showError("Please enter both email and password.");
    return;
  }

  if (email === demoUsers[selectedRole].email && password === demoUsers[selectedRole].password) {
    localStorage.setItem("attendiqUserRole", selectedRole);
    localStorage.setItem("attendiqUserEmail", email);
    localStorage.setItem("attendiqUserName", selectedRole === "student" ? "Student" : "Lecturer");
    hideError();
    if (selectedRole === "student") {
      window.location.href = "student-dashboard.html";
      return;
    }
    window.location.href = "Pages/lec-dashboard.html";
    return;
  }

  showError("Invalid credentials. Please try again.");
}

function setRegisterRole(role, button) {
  registerRole = role;
  updateActiveButton(".role-toggle button", button);
  hideError();

  const studentIdGroup = document.getElementById("studentIdGroup");
  if (studentIdGroup) {
    studentIdGroup.style.display = role === "student" ? "block" : "none";
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

function handleRegister() {
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
  alert("Registration successful. Next step is connecting this form to your backend API.");
  window.location.href = "login.html";
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
