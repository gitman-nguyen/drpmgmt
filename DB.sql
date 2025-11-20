select * from TRN;

select * from dbtbl1d where fid like '%MSGL%';

select * from dbtbl;

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

-- Thêm cột attachement cho bảng scenarios
ALTER TABLE scenarios ADD COLUMN attachment JSONB;

-- Bảng này sẽ lưu người được gán cho từng bước trong một cuộc diễn tập cụ thể
CREATE TABLE drill_step_assignments (
    drill_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    assignee_id TEXT,
    PRIMARY KEY (drill_id, step_id),
    FOREIGN KEY (drill_id) REFERENCES drills(id) ON DELETE CASCADE,
    FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tạo bảng lưu thông tin checkpoint
CREATE TABLE drill_checkpoints (
    id TEXT PRIMARY KEY,
    drill_id TEXT REFERENCES drills(id) ON DELETE CASCADE,
    after_scenario_id TEXT REFERENCES scenarios(id) ON DELETE CASCADE,
    title TEXT NOT NULL
);

-- Tạo bảng lưu các tiêu chí đánh giá của checkpoint
CREATE TABLE drill_checkpoint_criteria (
    id TEXT PRIMARY KEY,
    checkpoint_id TEXT REFERENCES drill_checkpoints(id) ON DELETE CASCADE,
    criterion_text TEXT NOT NULL,
    criterion_order INTEGER
);

-- Tạo bảng lưu kết quả checkpoint khi thực thi drill
CREATE TABLE execution_checkpoint_criteria (
    drill_id TEXT NOT NULL,
    criterion_id TEXT NOT NULL,
    status TEXT, -- Sẽ có giá trị là 'Pass' hoặc 'Fail'
    checked_by TEXT REFERENCES users(id),
    checked_at TIMESTAMPTZ,
    PRIMARY KEY (drill_id, criterion_id)
);

-- Thêm trường lý do failed drill
ALTER TABLE drills
ADD COLUMN failure_reason TEXT;

-- Thêm bảng app setting va thiet lap thoi gian session timeout mac dinh la 15 phut
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO app_settings (key, value)
VALUES ('sessionTimeout', '15')
ON CONFLICT (key) DO NOTHING;

-- Them cot appliation name trong bang scenarios
ALTER TABLE scenarios
ADD COLUMN application_name VARCHAR(255);

-- Thêm cột 'group_name' vào bảng 'drill_scenarios' để lưu tên khối của kịch bản.
-- Lệnh này sẽ thêm một cột kiểu TEXT và đặt giá trị mặc định là 'Default Group'
-- cho các hàng đã tồn tại để tránh lỗi null.
ALTER TABLE drill_scenarios
ADD COLUMN group_name TEXT NOT NULL DEFAULT 'Default Group';

-- Tạo bảng mới 'drill_group_dependencies' để lưu trữ các mối quan hệ phụ thuộc giữa các khối.
-- Bảng này sẽ liên kết các khối với nhau trong phạm vi của một buổi diễn tập (drill).
CREATE TABLE drill_group_dependencies (
drill_id TEXT NOT NULL,
group_name TEXT NOT NULL,
depends_on_group_name TEXT NOT NULL,
PRIMARY KEY (drill_id, group_name, depends_on_group_name),
FOREIGN KEY (drill_id) REFERENCES drills(id) ON DELETE CASCADE
);

-- Ghi chú:
-- - drill_id: ID của buổi diễn tập.
-- - group_name: Tên của khối phụ thuộc (khối con).
-- - depends_on_group_name: Tên của khối mà 'group_name' phụ thuộc vào (khối cha).
-- - PRIMARY KEY đảm bảo rằng mỗi mối quan hệ phụ thuộc là duy nhất cho một buổi diễn tập.
-- - FOREIGN KEY đảm bảo tính toàn vẹn dữ liệu; nếu một buổi diễn tập bị xóa, các phụ thuộc của nó cũng sẽ bị xóa.


-- Cap nhat thong tin nguoi tao kich ban
update scenarios set created_by='user-1757610384698' where id ='scen-1757588399928'

select * from scenarios where id ='scen-1757519469178'

select id, name, application_name, created_by from scenarios

select * from users

update execution_steps set status='InProgress' where step_id='step-1757590738812-5'
select * from steps

select * from drills

select id,name, execution_status, opened_at from drills

update drills set execution_status='InProgress' where id='drill-1756442090204'

update drills set execution_status='Closed' where id='drill-1757611787267'
update drills set execution_status='Scheduled' where id='drill-1757868179736'

delete from drills where id='drill-1755537488920'

update drills set opened_at=null where id='drill-1757611787267'

-- Them bang quan ly server
CREATE TABLE managed_servers (
      id SERIAL PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      ip_address TEXT NOT NULL,
      application_name TEXT,
      technologies TEXT[] DEFAULT '{}',
      connection_status VARCHAR(20) DEFAULT 'Not Connected' CHECK (connection_status IN ('Connected', 'Not Connected', 'Checking')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- Them index cho bang server de tang toc truy van
CREATE INDEX idx_hostname ON managed_servers(hostname);

-- Bảng mới để quản lý danh mục ứng dụng
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    app_code VARCHAR(50) UNIQUE NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Them truong ssh_user vao bang server
ALTER TABLE managed_servers ADD COLUMN ssh_user VARCHAR(255);

------

-- Them truong last_checked_at vao bang managed servers
ALTER TABLE managed_servers
ADD COLUMN last_checked_at TIMESTAMP WITH TIME ZONE;

select * from managed_servers


-- 1. Thêm cột 'type' vào bảng 'scenarios' để phân biệt loại kịch bản
-- Mặc định các kịch bản hiện có sẽ là 'MANUAL'
ALTER TABLE scenarios
ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'MANUAL';

-- Ghi chú: VARCHAR(20) đủ để lưu 'MANUAL' hoặc 'AUTOMATION'

-- 2. Thêm các cột dành cho kịch bản tự động hóa vào bảng 'steps'
-- Các cột này sẽ là NULL đối với các bước của kịch bản 'MANUAL'
ALTER TABLE steps
ADD COLUMN server_id INTEGER,
ADD COLUMN server_user VARCHAR(100),
ADD COLUMN command TEXT;

-- 3. (Quan trọng) Thêm ràng buộc khóa ngoại (Foreign Key) từ bảng 'steps' đến bảng 'managed_servers'
-- Điều này đảm bảo rằng mỗi bước tự động hóa phải liên kết với một server đã tồn tại.
-- Giả định rằng bảng quản lý server của anh/chị có tên là 'managed_servers' và khóa chính là 'id'.
ALTER TABLE steps
ADD CONSTRAINT fk_managed_servers
FOREIGN KEY (server_id) REFERENCES managed_servers(id)
ON DELETE SET NULL; -- Nếu server bị xóa, trường server_id trong step sẽ được set về NULL


---- Queries
select * from scenarios

select * from execution_steps
