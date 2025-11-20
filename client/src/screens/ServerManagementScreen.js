import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
// (CẬP NHẬT) Import icon từ file tập trung và giữ lại các icon còn thiếu từ lucide
import { Terminal, Command, X, Eye, EyeOff } from 'lucide-react';
import {
PencilIcon,
TrashIcon,
KeyIcon,
UploadIcon,
DownloadIcon
} from '../components/icons/index.js'; // Giả định đường dẫn

const TestConnectionModal = ({ isOpen, onClose, logs, t }) => {
if (!isOpen) return null;
return (
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
<div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl">
<h3 className="text-lg font-bold text-gray-900 mb-4">{t('testingConnectionTitle')}</h3>
<pre className="bg-gray-900 text-white font-mono text-sm p-4 rounded-lg overflow-x-auto h-64">
{logs || t('waitingForLogs')}
</pre>
<div className="flex justify-end mt-4">
<button onClick={onClose} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">{t('close')}</button>
</div>
</div>
</div>
);
};

const ConsoleModal = ({ server, onClose }) => {
const terminalRef = useRef(null);
const [isLibsLoaded, setIsLibsLoaded] = useState(false);

// Tải thư viện xterm.js
useEffect(() => {
    const loadScripts = async () => {
        const loadScript = (src) => new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Script load error for ${src}`));
            document.head.appendChild(script);
        });
        const loadCss = (href) => {
             if (document.querySelector(`link[href="${href}"]`)) return;
             const link = document.createElement('link');
             link.rel = 'stylesheet';
             link.href = href;
             document.head.appendChild(link);
        };
        try {
            // (ĐÃ SỬA) Thay đổi CDN sang đường dẫn local
            loadCss('/assets/css/xterm.min.css');
            await loadScript('/assets/js/xterm.min.js');
            await loadScript('/assets/js/xterm-addon-fit.min.js');
            setIsLibsLoaded(true);
        } catch (error) {
            console.error("Failed to load xterm libraries", error);
        }
    };
    loadScripts();
}, []);

// Khởi tạo terminal và WebSocket
useEffect(() => {
    if (!isLibsLoaded || !terminalRef.current || !server) return;

    if (typeof window.Terminal !== 'function' || typeof window.FitAddon.FitAddon !== 'function') return;
    
    const term = new window.Terminal({
        cursorBlink: true,
        theme: { background: '#1a1b26', foreground: '#cbced3', cursor: '#cbced3' }
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
    
    const wsUrl = `${protocol}//${host}/ws/servers/${server.id}/shell`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        term.focus();
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (event) => term.write(event.data);
    ws.onclose = () => term.write('\r\n\x1b[31mConnection closed.\x1b[0m');
    ws.onerror = () => term.write('\r\n\x1b[31mWebSocket connection error.\x1b[0m');

    term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
    });
    
    const handleResize = () => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
        window.removeEventListener('resize', handleResize);
        ws.close();
        term.dispose();
    };
}, [isLibsLoaded, server]);

return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
        <div className="bg-[#1a1b26] rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[80vh] flex flex-col p-2">
            <div className="flex justify-between items-center text-gray-300 pb-2 flex-shrink-0">
                <h3 className="text-md font-semibold">Console: {server?.ssh_user}@{server?.hostname}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            <div ref={terminalRef} className="flex-grow w-full h-full p-1"></div>
        </div>
    </div>
);


};

const RegisterKeyModal = ({ isOpen, onClose, onRegister, server, t }) => {
const [password, setPassword] = useState('');
const [isRegistering, setIsRegistering] = useState(false);
const [showPassword, setShowPassword] = useState(false);

if (!isOpen) return null;

const handleSubmit = async (e) => {
    e.preventDefault();
    setIsRegistering(true);
    try {
        await onRegister(password);
        setPassword(''); // Xóa pass sau khi thành công
    } catch (error) {
        // Lỗi đã được xử lý bởi onRegister, chỉ cần dừng loading
    } finally {
        setIsRegistering(false);
    }
};

return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t('registerKeyTitle', 'Đăng ký SSH Key')}</h3>
            <p className="text-sm text-gray-600 mb-4">
                {t('sshPasswordFor', 'Nhập mật khẩu SSH cho')}: <strong className="font-medium text-gray-900">{server?.ssh_user}@{server?.ip_address}</strong>
            </p>
            <form onSubmit={handleSubmit}>
                <label className="block text-sm font-medium text-gray-700">SSH Password</label>
                <div className="relative mt-1">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="block w-full bg-gray-50 border border-gray-300 rounded-md p-2 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
                <div className="flex justify-end space-x-2 mt-6">
                    <button type="button" onClick={onClose} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300" disabled={isRegistering}>
                        {t('cancel', 'Cancel')}
                    </button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg disabled:bg-blue-300" disabled={isRegistering}>
                        {isRegistering ? t('registering', 'Đang đăng ký...') : t('register', 'Đăng ký')}
                    </button>
                </div>
            </form>
        </div>
    </div>
);


};

// (TỐI ƯU): Nhận prop isXlsxReady
const ServerManagementScreen = ({ applications, onDataRefresh, isXlsxReady }) => {
const { t } = useTranslation();
const [servers, setServers] = useState([]);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState(null);
const [isModalOpen, setIsModalOpen] = useState(false);
const [editingServer, setEditingServer] = useState(null);
const [searchTerm, setSearchTerm] = useState('');
const [isTestModalOpen, setIsTestModalOpen] = useState(false);
const [testLogs, setTestLogs] = useState('');
const [isConsoleOpen, setIsConsoleOpen] = useState(false);
const [consoleServer, setConsoleServer] = useState(null);
const [isRegisterKeyModalOpen, setIsRegisterKeyModalOpen] = useState(false);
const [serverToRegisterKey, setServerToRegisterKey] = useState(null);
const [isImporting, setIsImporting] = useState(false);
const fileInputRef = useRef(null);

// (MỚI) State cho server
const [selectedServers, setSelectedServers] = useState([]);

// (TỐI ƯU): Xóa bỏ useEffect tải SheetJS từ CDN
/*
useEffect(() => {
    const loadSheetJS = () => {
        const src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        if (document.querySelector(`script[src="${src}"]`)) return;
        try {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            document.head.appendChild(script);
        } catch (error) {
            console.error("Failed to load SheetJS library", error);
            alert(t('sheetjsLoadError', 'Không thể tải thư viện đọc file Excel. Chức năng import .xlsx sẽ không hoạt động.'));
        }
    };
    loadSheetJS();
}, [t]);
*/


const fetchServers = async () => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/config/servers');
        if (!response.ok) throw new Error(t('failedToFetchServers'));
        const data = await response.json();
        setServers(data);
    } catch (err) { setError(err.message); } 
    finally { setIsLoading(false); }
};

useEffect(() => { fetchServers(); }, []);

const handleOpenModal = (server = null) => {
    setEditingServer(server);
    setIsModalOpen(true);
};

const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingServer(null);
};

const handleSaveServer = async (serverData) => {
    const url = editingServer ? `/api/config/servers/${editingServer.id}` : '/api/config/servers';
    const method = editingServer ? 'PUT' : 'POST';

    const applicationId = parseInt(serverData.application_id);
    const application = Array.isArray(applications) ? applications.find(app => app.id === applicationId) : null;
    
    let technologies = [];
    if (typeof serverData.technology === 'string') {
        technologies = serverData.technology.split(',').map(t => t.trim()).filter(Boolean);
    }
    
    const payload = {
        hostname: serverData.hostname,
        ip_address: serverData.ip_address,
        ssh_user: serverData.ssh_user,
        application_name: application ? application.app_name : '',
        technologies: technologies,
        ssh_password: serverData.ssh_password,
        skip_key_registration: serverData.skip_key_registration,
    };

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || t('failedToSaveServer'));
        }
        await fetchServers();
        handleCloseModal();
        onDataRefresh();
    } catch (err) {
        alert(`${t('errorPrefix')}${err.message}`);
    }
};

const handleSaveBulkServer = async (serversToSave) => {
    setIsImporting(true);
    const payload = { servers: serversToSave };
    try {
        const response = await fetch('/api/config/servers/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || t('failedToSaveServer'));
        }
        const createdServers = await response.json();
        alert(t('importSuccess', `Đã import thành công ${createdServers.length} server.`));
        await fetchServers();
        onDataRefresh();
    } catch (err) {
        alert(`${t('errorPrefix')}${err.message}`);
    } finally {
        setIsImporting(false);
    }
};

const handleOpenRegisterKey = (server) => {
    setServerToRegisterKey(server);
    setIsRegisterKeyModalOpen(true);
};

const handleCloseRegisterKey = () => {
    setIsRegisterKeyModalOpen(false);
    setServerToRegisterKey(null);
};

const handleRegisterKey = async (password) => {
    const server = serverToRegisterKey;
    if (!server) return;

    try {
        const response = await fetch(`/api/config/servers/${server.id}/register-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ssh_password: password })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || t('failedToRegisterKey', 'Đăng ký key thất bại'));
        }
        alert(t('registerKeySuccess', 'Đăng ký key thành công!'));
        handleCloseRegisterKey();
        handleTestConnection(server); // Tự động test
    } catch (err) {
        alert(`${t('errorPrefix')}${err.message}`);
        throw err;
    }
};


const handleDeleteServer = async (id) => {
    if (!window.confirm(t('confirmDeleteServer'))) return;
    try {
        const response = await fetch(`/api/config/servers/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(t('failedToDeleteServer'));
        await fetchServers();
        setSelectedServers(prev => prev.filter(sId => sId !== id)); // (MỚI) Bỏ chọn
    } catch (err) {
         alert(`${t('errorPrefix')}${err.message}`);
    }
};

const handleTestConnection = async (server) => {
    setTestLogs(`Đang kiểm tra kết nối SSH đến ${server.hostname} (${server.ip_address})...\nUser: ${server.ssh_user}\n\n`);
    setIsTestModalOpen(true);

    try {
        const res = await fetch(`/api/config/servers/${server.id}/check`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to initiate test');
        }
        setTestLogs(prev => prev + '✓ Test kết nối đã được khởi tạo thành công\n⏳ Đang thực hiện SSH connection test...\n');

        let attempts = 0;
        const maxAttempts = 15;
        const pollInterval = setInterval(async () => {
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                setTestLogs(prev => prev + '⌛️ Test timed out.\n');
                return;
            }
            attempts++;
            try {
                const response = await fetch('/api/config/servers');
                if (!response.ok) return;
                const allServers = await response.json();
                setServers(allServers);
                const updatedServer = allServers.find(s => s.id === server.id);
                if (updatedServer && updatedServer.status !== 'Checking') {
                    clearInterval(pollInterval);
                    if (updatedServer.status === 'Connected') {
                        setTestLogs(prev => prev + `📊 Trạng thái hiện tại: ${updatedServer.status}\n✅ Kết nối thành công!\n`);
                    } else {
                        setTestLogs(prev => prev + `📊 Trạng thái hiện tại: ${updatedServer.status}\n❌ Kết nối thất bại!\n`);
                    }
                }
            } catch (pollError) {
                console.error("Polling error:", pollError);
            }
        }, 2000);
    } catch (err) {
        setTestLogs(prev => prev + `❌ Lỗi khi khởi tạo: ${err.message}\n`);
    }
};

const handleOpenConsole = (server) => {
    setConsoleServer(server);
    setIsConsoleOpen(true);
};

const handleDownloadTemplate = () => {
    // (TỐI ƯU): Kiểm tra isXlsxReady hoặc window.XLSX
    if (!isXlsxReady || typeof window.XLSX === 'undefined') {
        alert(t('sheetjsError', 'Thư viện đọc file Excel chưa tải xong. Vui lòng thử lại sau giây lát.'));
        return;
    }
    const headers = [
        "hostname (Bắt buộc)",
        "ip_address (Bắt buộc)",
        "ssh_user (Bắt buộc)",
        "application_name (Bắt buộc)",
        "technologies (Cách nhau bởi dấu phẩy, ví dụ: linux,java)"
    ];
    const exampleData = [
        ["web-01", "10.0.0.1", "admin", "Core Banking", "linux,weblogic"],
        ["app-01", "10.0.0.2", "ubuntu", "Mobile App", "linux,java"]
    ];
    const data = [headers, ...exampleData];
    try {
        const wb = window.XLSX.utils.book_new();
        const ws = window.XLSX.utils.aoa_to_sheet(data);
        const colWidths = [ { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 50 } ];
        ws['!cols'] = colWidths;
        window.XLSX.utils.book_append_sheet(wb, ws, "Danh sách Server");
        window.XLSX.writeFile(wb, "server_template.xlsx");
    } catch (err) {
        console.error("Error creating Excel template:", err);
        alert(t('excelExportError', 'Có lỗi xảy ra khi tạo file Excel.'));
    }
};

const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // (TỐI ƯU): Kiểm tra isXlsxReady hoặc window.XLSX
    if (!isXlsxReady || typeof window.XLSX === 'undefined') {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            alert(t('sheetjsError', 'Thư viện đọc file Excel chưa tải xong. Vui lòng thử lại sau giây lát.'));
            if (fileInputRef.current) {
                fileInputRef.current.value = null;
            }
            return;
        }
    }

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = (event) => {
        try {
            const data = event.target.result;
            let servers = [];

            if (file.name.endsWith('.csv')) {
                const lines = data.split('\n');
                servers = lines.slice(1).map(line => {
                    const parts = line.split(',');
                    return { 
                        hostname: parts[0]?.trim(), 
                        ip_address: parts[1]?.trim(), 
                        ssh_user: parts[2]?.trim(), 
                        application_name: parts[3]?.trim(), 
                        technologies: parts.slice(4).map(s => s.trim()).join(',') 
                    };
                }).filter(s => s.hostname && s.ip_address && s.ssh_user && s.application_name);

            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                if (typeof window.XLSX === 'undefined') {
                     // Kiểm tra lại một lần nữa phòng trường hợp isXlsxReady
                     // cập nhật chậm
                    alert(t('sheetjsError', 'Thư viện đọc file Excel chưa tải xong. Vui lòng thử lại sau giây lát.'));
                    setIsImporting(false);
                    return;
                }
                const workbook = window.XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                servers = rows.slice(1).map(row => ({
                    hostname: row[0]?.trim(),
                    ip_address: row[1]?.trim(),
                    ssh_user: row[2]?.trim(),
                    application_name: row[3]?.trim(),
                    technologies: row[4]?.trim(),
                })).filter(s => s.hostname && s.ip_address && s.ssh_user && s.application_name);
        
            } else {
                alert(t('fileTypeError', 'Chỉ hỗ trợ file .csv và .xlsx'));
                setIsImporting(false);
                return;
            }
            
            const serversToSave = servers.map(s => ({
                ...s,
                technologies: s.technologies ? s.technologies.split(',').map(t => t.trim()).filter(Boolean) : []
            }));

            if (serversToSave.length > 0) {
                handleSaveBulkServer(serversToSave);
            } else {
                alert(t('noServersParsed', 'Không có server nào hợp lệ được đọc từ file.'));
                setIsImporting(false);
            }

        } catch (err) {
            console.error("File parsing error:", err);
            alert(t('fileParseError', 'Có lỗi xảy ra khi đọc file.'));
            setIsImporting(false);
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = null;
            }
        }
    };

    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
};

const filteredServers = servers.filter(server => 
    server.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.ip_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (server.application_name && server.application_name.toLowerCase().includes(searchTerm.toLowerCase()))
);

// (MỚI) Logic chọn/bỏ chọn
const handleSelectServer = (id) => {
    setSelectedServers(prev => 
        prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
};

const handleSelectAll = () => {
    if (isAllSelected) {
        setSelectedServers([]);
    } else {
        setSelectedServers(filteredServers.map(s => s.id));
    }
};

const isAllSelected = filteredServers.length > 0 && selectedServers.length === filteredServers.length;

// (MỚI) Logic xử lý hàng loạt
const handleBulkDelete = async () => {
    if (!window.confirm(t('confirmBulkDelete', `Bạn có chắc muốn XÓA ${selectedServers.length} máy chủ đã chọn? Hành động này không thể hoàn tác.`))) return;
    
    setIsLoading(true);
    const promises = selectedServers.map(id => fetch(`/api/config/servers/${id}`, { method: 'DELETE' }));
    const results = await Promise.allSettled(promises);

    const failedCount = results.filter(r => r.status === 'rejected').length;
    alert(t('bulkDeleteResult', `Đã xóa thành công ${selectedServers.length - failedCount} server. Thất bại: ${failedCount}.`));
    
    setSelectedServers([]);
    setIsLoading(false);
    await fetchServers();
};

const handleBulkTestConnection = async () => {
    if (!window.confirm(t('confirmBulkTest', `Bạn có chắc muốn kiểm tra kết nối của ${selectedServers.length} máy chủ đã chọn?`))) return;

    alert(t('bulkTestStarted', 'Đã gửi yêu cầu kiểm tra. Trạng thái sẽ được cập nhật tự động.'));
    
    const promises = selectedServers.map(id => 
        fetch(`/api/config/servers/${id}/check`, { method: 'POST' })
        .catch(err => console.error(`Error testing server ${id}:`, err)) // Bắt lỗi để Promise.all không dừng
    );
    
    await Promise.all(promises);
    
    // Cập nhật trạng thái "Checking" ngay lập tức
    setServers(prevServers => 
        prevServers.map(s => 
            selectedServers.includes(s.id) ? { ...s, status: 'Checking' } : s
        )
    );

    // Sau 5s, fetch lại toàn bộ để lấy kết quả
    setTimeout(fetchServers, 5000);
};


return (
    <div className="bg-white p-6 rounded-2xl shadow-lg">
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            className="hidden"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        />
        
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{t('serverManagement')}</h2>
            <div className="flex space-x-2">
                <button 
                    onClick={handleDownloadTemplate} 
                    className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 flex items-center disabled:bg-gray-400"
                    // (TỐI ƯU): disable nút khi thư viện chưa sẵn sàng
                    disabled={isImporting || !isXlsxReady}
                >
                    <DownloadIcon className="h-5 w-5 mr-2" />
                    {t('downloadTemplate', 'Tải file mẫu')}
                </button>
                <button 
                    onClick={() => fileInputRef.current.click()} 
                    className="bg-blue-100 text-blue-700 font-bold py-2 px-4 rounded-lg hover:bg-blue-200 flex items-center disabled:bg-gray-400"
                     // (TỐI ƯU): disable nút khi thư viện chưa sẵn sàng
                    disabled={isImporting || !isXlsxReady}
                >
                    <UploadIcon className="h-5 w-5 mr-2" />
                    {isImporting ? t('importing', 'Đang import...') : t('importFromExcel', 'Import từ Excel')}
                </button>
                <button 
                    onClick={() => handleOpenModal()} 
                    className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700"
                    disabled={isImporting}
                >
                    {t('addServer')}
                </button>
            </div>
        </div>

        <div className="mb-4">
            <input type="text" placeholder={t('searchServer')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg"/>
        </div>

        {/* (MỚI) Thanh hành động hàng loạt */}
        {selectedServers.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                <span className="text-sm font-medium text-blue-700">
                    {t('selectedCount', `Đã chọn ${selectedServers.length} máy chủ`)}
                </span>
                <div className="flex space-x-2">
                    <button 
                        onClick={handleBulkTestConnection}
                        className="flex items-center bg-blue-100 text-blue-700 text-sm font-semibold py-2 px-3 rounded-lg hover:bg-blue-200"
                    >
                        <Terminal size={16} className="mr-2" />
                        {t('testConnection', 'Kiểm tra kết nối')}
                    </button>
                    <button 
                        onClick={handleBulkDelete}
                        className="flex items-center bg-red-100 text-red-700 text-sm font-semibold py-2 px-3 rounded-lg hover:bg-red-200"
                    >
                        <TrashIcon className="h-4 w-4 mr-2" />
                        {t('delete', 'Xóa')}
                    </button>
                </div>
            </div>
        )}

        {isLoading && <p>Loading...</p>}
        {error && <p className="text-red-500">{error}</p>}
        
        <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
                <thead className="bg-gray-50">
                    <tr>
                        {/* (MỚI) Checkbox chọn tất cả */}
                        <th className="py-3 px-4 w-12 text-center">
                            <input 
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                checked={isAllSelected}
                                onChange={handleSelectAll}
                                disabled={filteredServers.length === 0}
                            />
                        </th>
                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('hostname')}</th>
                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('ipAddress')}</th>
                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('application')}</th>
                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('technology')}</th>
                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('status')}</th>
                        <th className="py-3 px-6 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {filteredServers.map(server => (
                        <tr key={server.id} className={selectedServers.includes(server.id) ? 'bg-blue-50' : ''}>
                            {/* (MỚI) Checkbox chọn từng hàng */}
                            <td className="py-4 px-4 w-12 text-center">
                                <input 
                                    type="checkbox"
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                    checked={selectedServers.includes(server.id)}
                                    onChange={() => handleSelectServer(server.id)}
                                />
                            </td>
                            <td className="py-4 px-6 whitespace-nowrap">{server.hostname}</td>
                            <td className="py-4 px-6 whitespace-nowrap">{server.ip_address}</td>
                            <td className="py-4 px-6 whitespace-nowrap">{server.application_name || 'N/A'}</td>
                            <td className="py-4 px-6 whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                    {(Array.isArray(server.technology) ? server.technology : []).map((tech, index) => (
                                        <span key={index} className="px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">{tech}</span>
                                    ))}
                                </div>
                            </td>
                            <td className="py-4 px-6 whitespace-nowrap">
                                 <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${server.status === 'Connected' ? 'bg-green-100 text-green-800' : server.status === 'Checking' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                    {server.status}
                                </span>
                            </td>
                            <td className="py-4 px-6 whitespace-nowrap text-sm font-medium text-center">
                                <button onClick={() => handleOpenRegisterKey(server)} title={t('registerKey', 'Đăng ký Key')} className="text-gray-500 hover:text-yellow-600 p-2"><KeyIcon className="h-5 w-5" /></button>
                                <button onClick={() => handleOpenConsole(server)} title={t('console')} className="text-gray-500 hover:text-purple-600 p-2"><Command size={18} /></button>
                                <button onClick={() => handleTestConnection(server)} title={t('test')} className="text-gray-500 hover:text-blue-600 p-2"><Terminal size={18} /></button>
                                <button onClick={() => handleOpenModal(server)} title={t('edit')} className="text-gray-500 hover:text-green-600 p-2"><PencilIcon className="h-5 w-5" /></button>
                                <button onClick={() => handleDeleteServer(server.id)} title={t('delete')} className="text-gray-500 hover:text-red-600 p-2"><TrashIcon className="h-5 w-5" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {isModalOpen && (
            <ServerModal server={editingServer} onClose={handleCloseModal} onSave={handleSaveServer} applications={applications} t={t}/>
        )}
        
        <RegisterKeyModal 
            isOpen={isRegisterKeyModalOpen} 
            onClose={handleCloseRegisterKey} 
            onRegister={handleRegisterKey} 
            server={serverToRegisterKey}
            t={t}
        />
        <TestConnectionModal isOpen={isTestModalOpen} onClose={() => setIsTestModalOpen(false)} logs={testLogs} t={t}/>
        {isConsoleOpen && <ConsoleModal server={consoleServer} onClose={() => setIsConsoleOpen(false)} />}
    </div>
);


};

const ServerModal = ({ server, onClose, onSave, applications, t }) => {
const [formData, setFormData] = useState({
hostname: server?.hostname || '',
ip_address: server?.ip_address || '',
application_id: server?.application_id || '',
ssh_user: server?.ssh_user || '',
technology: server?.technology?.join(', ') || '',
ssh_password: '',
skip_key_registration: false,
});
const [showPassword, setShowPassword] = useState(false);

useEffect(() => {
    if (server) {
        setFormData(prev => ({ ...prev, skip_key_registration: true }));
    }
}, [server]);


const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
};

const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
};

return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{server ? t('editServer') : t('addServer')}</h3>
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('hostname')}</label>
                        <input type="text" name="hostname" value={formData.hostname} onChange={handleChange} required className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('ipAddress')}</label>
                        <input type="text" name="ip_address" value={formData.ip_address} onChange={handleChange} required className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('sshUser')}</label>
                        <input type="text" name="ssh_user" value={formData.ssh_user} onChange={handleChange} required className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('application')}</label>
                        <select name="application_id" value={formData.application_id} onChange={handleChange} required className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2">
                            <option value="">{t('selectApplication')}</option>
                            {Array.isArray(applications) && applications.map(app => (<option key={app.id} value={app.id}>{app.app_name}</option>))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('technologyCommaSeparated')}</label>
                        <input type="text" name="technology" value={formData.technology} onChange={handleChange} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2"/>
                    </div>
                    {!server && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">SSH Password (để tự động đăng ký key)</label>
                                <div className="relative mt-1">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="ssh_password"
                                        value={formData.ssh_password}
                                        onChange={handleChange}
                                        disabled={formData.skip_key_registration}
                                        className="block w-full bg-gray-50 border border-gray-300 rounded-md p-2 pr-10 disabled:bg-gray-200"
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center pt-2">
                                <input id="skip_key_registration" name="skip_key_registration" type="checkbox" checked={formData.skip_key_registration} onChange={handleChange} className="h-4 w-4 text-blue-600 border-gray-300 rounded"/>
                                <label htmlFor="skip_key_registration" className="ml-2 block text-sm text-gray-900">Bỏ qua đăng ký key (key đã được thêm thủ công)</label>
                            </div>
                        </>
                    )}
                </div>
                <div className="flex justify-end space-x-2 mt-6">
                    <button type="button" onClick={onClose} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">{t('cancel', 'Cancel')}</button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg">{t('save', 'Save')}</button>
                </div>
            </form>
        </div>
    </div>
);


};

export default ServerManagementScreen;