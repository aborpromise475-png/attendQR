-- AttendIQ Production Database Schema
-- Compatible with PostgreSQL (Render) and SQLite

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'lecturer')),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    department VARCHAR(100),
    student_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_sessions (
    id VARCHAR(64) PRIMARY KEY,
    lecturer_email VARCHAR(150) NOT NULL,
    lecturer_name VARCHAR(100),
    course_code VARCHAR(30) NOT NULL,
    course_name VARCHAR(150) NOT NULL,
    room VARCHAR(50),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    allowed_radius_meters INTEGER DEFAULT 150,
    signature TEXT NOT NULL,
    scan_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS device_bindings (
    id VARCHAR(64) PRIMARY KEY,
    student_email VARCHAR(150) UNIQUE NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    bound_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    course_code VARCHAR(30) NOT NULL,
    course_name VARCHAR(150) NOT NULL,
    lecturer_email VARCHAR(150),
    student_email VARCHAR(150) NOT NULL,
    student_name VARCHAR(100),
    student_id VARCHAR(50),
    device_id VARCHAR(100),
    room VARCHAR(50),
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Present',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    note TEXT,
    CONSTRAINT unique_session_student UNIQUE (session_id, student_email)
);

-- Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_lecturer ON class_sessions(lecturer_email);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_email);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_bindings_student ON device_bindings(student_email);
