-- Bảng người dùng
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- Trong thực tế, hãy mã hóa mật khẩu (hash)
    role VARCHAR(50) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    description TEXT
);

-- Bảng kịch bản
CREATE TABLE scenarios (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_by VARCHAR(255) REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) NOT NULL,
    basis TEXT
);

-- Bảng các bước trong kịch bản
CREATE TABLE steps (
    id VARCHAR(255) PRIMARY KEY,
    scenario_id VARCHAR(255) REFERENCES scenarios(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    estimated_time VARCHAR(50),
    step_order INT NOT NULL
);

-- Bảng phụ thuộc giữa các bước
CREATE TABLE step_dependencies (
    step_id VARCHAR(255) REFERENCES steps(id) ON DELETE CASCADE,
    depends_on_step_id VARCHAR(255) REFERENCES steps(id) ON DELETE CASCADE,
    PRIMARY KEY (step_id, depends_on_step_id)
);

-- Bảng các đợt diễn tập
CREATE TABLE drills (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL,
    execution_status VARCHAR(50) NOT NULL,
    basis TEXT,
    start_date DATE,
    end_date DATE,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- Bảng liên kết Drills và Scenarios
CREATE TABLE drill_scenarios (
    drill_id VARCHAR(255) REFERENCES drills(id) ON DELETE CASCADE,
    scenario_id VARCHAR(255) REFERENCES scenarios(id) ON DELETE CASCADE,
    scenario_order INT NOT NULL,
    PRIMARY KEY (drill_id, scenario_id)
);

-- Bảng phụ thuộc giữa các kịch bản trong một drill
CREATE TABLE drill_scenario_dependencies (
    drill_id VARCHAR(255),
    scenario_id VARCHAR(255),
    depends_on_scenario_id VARCHAR(255),
    FOREIGN KEY (drill_id, scenario_id) REFERENCES drill_scenarios(drill_id, scenario_id) ON DELETE CASCADE,
    FOREIGN KEY (drill_id, depends_on_scenario_id) REFERENCES drill_scenarios(drill_id, scenario_id) ON DELETE CASCADE,
    PRIMARY KEY (drill_id, scenario_id, depends_on_scenario_id)
);

-- Bảng lưu trạng thái thực thi của các bước
CREATE TABLE execution_steps (
    id SERIAL PRIMARY KEY,
    drill_id VARCHAR(255) REFERENCES drills(id) ON DELETE CASCADE,
    step_id VARCHAR(255) REFERENCES steps(id) ON DELETE CASCADE,
    status VARCHAR(50),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    assignee VARCHAR(255),
    result_text TEXT,
    UNIQUE(drill_id, step_id)
);

-- Bảng lưu kết quả xác nhận của kịch bản
CREATE TABLE execution_scenarios (
    id SERIAL PRIMARY KEY,
    drill_id VARCHAR(255) REFERENCES drills(id) ON DELETE CASCADE,
    scenario_id VARCHAR(255) REFERENCES scenarios(id) ON DELETE CASCADE,
    final_status VARCHAR(50),
    final_reason TEXT,
    UNIQUE(drill_id, scenario_id)
);

--- DỮ LIỆU MẪU ---

-- Chèn dữ liệu người dùng
INSERT INTO users (id, username, password, role, first_name, last_name, description) VALUES
('user-1', 'admin', 'password', 'ADMIN', 'Admin', 'User', 'System Administrator'),
('user-2', 'tech_user', 'password', 'TECHNICAL', 'Tech', 'User', 'Database Specialist'),
('user-3', 'biz_user', 'password', 'BUSINESS', 'Business', 'User', 'Communications Lead');

-- Chèn dữ liệu kịch bản
INSERT INTO scenarios (id, name, role, created_by, created_at, last_updated_at, status, basis) VALUES
('scen-1', 'Chuyển đổi dự phòng Database', 'TECHNICAL', 'user-2', '2025-08-10T10:00:00Z', '2025-08-11T14:30:00Z', 'Active', 'Kế hoạch DR năm 2025'),
('scen-2', 'Truyền thông Khách hàng', 'BUSINESS', 'user-3', '2025-08-10T11:00:00Z', '2025-08-10T11:00:00Z', 'Active', 'Kế hoạch DR năm 2025'),
('scen-3', 'Kiểm tra hiệu năng hệ thống', 'TECHNICAL', 'user-2', '2025-08-11T09:00:00Z', '2025-08-12T11:00:00Z', 'Draft', '');

-- Chèn dữ liệu các bước
INSERT INTO steps (id, scenario_id, title, description, estimated_time, step_order) VALUES
('step-101', 'scen-1', 'Khởi tạo nâng cấp Read Replica của RDS', 'Promote the standby RDS instance in us-west-2 to become the new primary.', '00:15:00', 1),
('step-102', 'scen-1', 'Cập nhật bản ghi DNS', 'Point the primary DB CNAME record to the new primary instance endpoint.', '00:05:00', 2),
('step-103', 'scen-1', 'Xác minh kết nối ứng dụng', 'Run health checks on all critical applications to ensure they can connect to the new database.', '00:10:00', 3),
('step-201', 'scen-2', 'Soạn thảo cập nhật trạng thái nội bộ', 'Prepare an internal communication for all staff about the ongoing DR drill.', '00:20:00', 1),
('step-202', 'scen-2', 'Đăng lên trang trạng thái công khai', 'Update the public status page to inform customers about scheduled maintenance (simulated).', '00:05:00', 2),
('step-301', 'scen-3', 'Chạy bài test tải', 'Use JMeter to run a load test against the new primary application servers.', '01:00:00', 1);

-- Chèn phụ thuộc giữa các bước
INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES
('step-102', 'step-101'),
('step-103', 'step-102'),
('step-202', 'step-201');

-- Chèn dữ liệu đợt diễn tập
INSERT INTO drills (id, name, description, status, execution_status, basis, start_date, end_date, opened_at, closed_at) VALUES
('drill-1', 'Diễn tập chuyển đổi dự phòng AWS Quý 3', 'Mô phỏng chuyển đổi dự phòng toàn bộ khu vực cho các dịch vụ quan trọng.', 'Active', 'InProgress', 'Quyết định số 123/QĐ-NHNN ngày 01/01/2025', '2025-08-16', '2025-08-18', '2025-08-16T10:00:00Z', NULL);

-- Chèn liên kết drill và kịch bản
INSERT INTO drill_scenarios (drill_id, scenario_id, scenario_order) VALUES
('drill-1', 'scen-1', 1),
('drill-1', 'scen-2', 2);

-- Chèn phụ thuộc kịch bản trong drill
INSERT INTO drill_scenario_dependencies (drill_id, scenario_id, depends_on_scenario_id) VALUES
('drill-1', 'scen-2', 'scen-1');

-- Chèn dữ liệu thực thi
INSERT INTO execution_steps (drill_id, step_id, status, started_at, completed_at, assignee) VALUES
('drill-1', 'step-101', 'Completed-Success', '2025-08-16T10:00:00Z', '2025-08-16T10:14:00Z', 'tech_user'),
('drill-1', 'step-102', 'InProgress', '2025-08-16T10:15:00Z', NULL, 'tech_user');
