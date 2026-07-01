-- Rare Veterinary Care LIMS - Database Schema
-- PostgreSQL 16+

-- UUIDs are generated in application code (uuid-ossp is blocked on some Windows hosts)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==================== ROLES & PERMISSIONS ====================
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    name_ar VARCHAR(100),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ==================== USERS ====================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    full_name_ar VARCHAR(255),
    phone VARCHAR(50),
    role_id INTEGER REFERENCES roles(id) NOT NULL,
    language VARCHAR(5) DEFAULT 'en',
    theme VARCHAR(10) DEFAULT 'light',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== CUSTOMERS ====================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    full_name_ar VARCHAR(255),
    mobile VARCHAR(50) NOT NULL,
    city VARCHAR(100),
    farm_company VARCHAR(255),
    notes TEXT,
    account_balance DECIMAL(12,2) DEFAULT 0,
    credit_limit DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_mobile ON customers(mobile);
CREATE INDEX idx_customers_name ON customers(full_name);

-- ==================== ANIMALS ====================
CREATE TYPE animal_type AS ENUM (
    'camel', 'sheep', 'horse', 'goat', 'other'
);

CREATE TYPE animal_gender AS ENUM ('male', 'female', 'unknown');

CREATE TABLE animals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    animal_code VARCHAR(50) UNIQUE NOT NULL,
    animal_type animal_type NOT NULL,
    name_tag VARCHAR(255),
    age VARCHAR(50),
    gender animal_gender DEFAULT 'unknown',
    weight DECIMAL(8,2),
    color VARCHAR(100),
    breed VARCHAR(100),
    rfid_chip VARCHAR(100),
    owner_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    image_url TEXT,
    medical_history TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_animals_owner ON animals(owner_id);
CREATE INDEX idx_animals_code ON animals(animal_code);
CREATE INDEX idx_animals_rfid ON animals(rfid_chip);

-- ==================== TEST CATEGORIES & TESTS ====================
CREATE TABLE test_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    code VARCHAR(20) UNIQUE NOT NULL,
    department VARCHAR(100),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    category_id INTEGER REFERENCES test_categories(id),
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    turnaround_hours INTEGER DEFAULT 24,
    unit VARCHAR(50),
    method VARCHAR(100),
    label_copies INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    requires_specimen VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE test_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    unit VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    is_calculated BOOLEAN DEFAULT false,
    formula TEXT,
    decimal_places INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE test_reference_ranges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parameter_id UUID REFERENCES test_parameters(id) ON DELETE CASCADE,
    animal_type animal_type,
    min_value DECIMAL(12,4),
    max_value DECIMAL(12,4),
    critical_low DECIMAL(12,4),
    critical_high DECIMAL(12,4),
    unit VARCHAR(50),
    notes TEXT
);

-- ==================== SAMPLES ====================
CREATE TYPE sample_status AS ENUM (
    'pending', 'received', 'running', 'completed', 'rejected', 'archived'
);

CREATE TABLE samples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_code VARCHAR(50) UNIQUE NOT NULL,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    animal_id UUID REFERENCES animals(id),
    status sample_status DEFAULT 'pending',
    department VARCHAR(100),
    collection_date TIMESTAMPTZ DEFAULT NOW(),
    received_date TIMESTAMPTZ,
    completed_date TIMESTAMPTZ,
    priority VARCHAR(20) DEFAULT 'normal',
    notes TEXT,
    rejection_reason TEXT,
    assigned_technician UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_samples_status ON samples(status);
CREATE INDEX idx_samples_barcode ON samples(barcode);
CREATE INDEX idx_samples_customer ON samples(customer_id);

CREATE TABLE sample_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE,
    test_id UUID REFERENCES tests(id),
    status sample_status DEFAULT 'pending',
    price DECIMAL(10,2),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    technician_id UUID REFERENCES users(id),
    notes TEXT,
    UNIQUE(sample_id, test_id)
);

-- ==================== RESULTS ====================
CREATE TABLE results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_test_id UUID REFERENCES sample_tests(id) ON DELETE CASCADE,
    entered_by UUID REFERENCES users(id),
    validated_by UUID REFERENCES users(id),
    validated_at TIMESTAMPTZ,
    is_validated BOOLEAN DEFAULT false,
    doctor_notes TEXT,
    technician_notes TEXT,
    has_critical BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE result_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    result_id UUID REFERENCES results(id) ON DELETE CASCADE,
    parameter_id UUID REFERENCES test_parameters(id),
    value VARCHAR(255),
    numeric_value DECIMAL(12,4),
    flag VARCHAR(20),
    is_critical BOOLEAN DEFAULT false,
    notes TEXT
);

-- ==================== REPORTS ====================
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_number VARCHAR(50) UNIQUE NOT NULL,
    sample_id UUID REFERENCES samples(id),
    pdf_url TEXT,
    qr_verification_code VARCHAR(100) UNIQUE,
    generated_by UUID REFERENCES users(id),
    specialist_signature TEXT,
    lab_specialist_approved_by UUID REFERENCES users(id),
    lab_specialist_approved_at TIMESTAMPTZ,
    vet_approved_by UUID REFERENCES users(id),
    vet_approved_at TIMESTAMPTZ,
    language VARCHAR(5) DEFAULT 'en',
    ai_interpretation TEXT,
    treatment_recommendations TEXT,
    is_final BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== BILLING ====================
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'credit');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'partial', 'cancelled', 'refunded');

CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE package_tests (
    package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, test_id)
);

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    sample_id UUID REFERENCES samples(id),
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 15,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    status invoice_status DEFAULT 'draft',
    vat_qr_data TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    test_id UUID REFERENCES tests(id),
    package_id UUID REFERENCES packages(id),
    animal_id UUID REFERENCES animals(id),
    description VARCHAR(255),
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2),
    total_price DECIMAL(10,2)
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id),
    customer_id UUID REFERENCES customers(id),
    amount DECIMAL(12,2) NOT NULL,
    method payment_method NOT NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    received_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id),
    invoice_id UUID REFERENCES invoices(id),
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT,
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== INVENTORY ====================
CREATE TYPE inventory_category AS ENUM (
    'reagent', 'tube', 'slide', 'consumable', 'chemical', 'other'
);

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    category inventory_category NOT NULL,
    unit VARCHAR(50) DEFAULT 'unit',
    quantity DECIMAL(12,2) DEFAULT 0,
    min_quantity DECIMAL(12,2) DEFAULT 0,
    lot_number VARCHAR(100),
    expiry_date DATE,
    location VARCHAR(100),
    supplier VARCHAR(255),
    cost_per_unit DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES inventory_items(id),
    type VARCHAR(20) NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    lot_number VARCHAR(100),
    reference VARCHAR(100),
    notes TEXT,
    performed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== QUALITY CONTROL ====================
CREATE TABLE qc_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID REFERENCES tests(id),
    parameter_id UUID REFERENCES test_parameters(id),
    expected_value DECIMAL(12,4),
    actual_value DECIMAL(12,4),
    lot_number VARCHAR(100),
    device_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pass',
    notes TEXT,
    performed_by UUID REFERENCES users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE device_maintenance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_name VARCHAR(255) NOT NULL,
    device_model VARCHAR(255),
    maintenance_type VARCHAR(100),
    description TEXT,
    performed_by VARCHAR(255),
    next_due_date DATE,
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE calibration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_name VARCHAR(255) NOT NULL,
    calibration_date TIMESTAMPTZ DEFAULT NOW(),
    next_calibration DATE,
    result VARCHAR(50),
    notes TEXT,
    performed_by UUID REFERENCES users(id)
);

CREATE TABLE temperature_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location VARCHAR(100) NOT NULL,
    temperature DECIMAL(5,2) NOT NULL,
    humidity DECIMAL(5,2),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    recorded_by UUID REFERENCES users(id),
    is_alert BOOLEAN DEFAULT false
);

-- ==================== NOTIFICATIONS ====================
CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== DEVICE INTEGRATION ====================
CREATE TABLE device_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    model VARCHAR(255),
    protocol VARCHAR(50),
    connection_type VARCHAR(50),
    host VARCHAR(255),
    port INTEGER,
    serial_port VARCHAR(50),
    config JSONB,
    is_active BOOLEAN DEFAULT false,
    last_connected TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE device_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES device_integrations(id),
    direction VARCHAR(10),
    raw_message TEXT,
    parsed_data JSONB,
    sample_id UUID REFERENCES samples(id),
    status VARCHAR(20) DEFAULT 'received',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== SETTINGS & AUDIT ====================
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    module VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_module ON audit_logs(module);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- updated_at is set in application code (plpgsql triggers break under Windows Application Control)
