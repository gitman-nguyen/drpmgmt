import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import RichTextEditor from '../components/common/RichTextEditor';
import DependencySelector from '../components/common/DependencySelector';
import { EditIcon, CloneIcon, SubmitApprovalIcon, ApproveIcon, RejectIcon, DragHandleIcon, DownloadIcon, UploadIcon, PaperClipIcon, DeleteIcon, ArrowLeftIcon, PlayIcon } from '../components/icons'; // Thêm PlayIcon

// --- START: Hook debounce (Hỗ trợ tìm kiếm) ---
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};
// --- END: Hook debounce ---


// --- START: Component Con Combobox Server (ĐÃ SỬA LỖI) ---
// Tách logic combobox ra component con để mỗi combobox quản lý state và ref của riêng nó
const ServerSelector = ({ servers, serverId, onChange }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedName, setSelectedName] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null); // Ref này giờ là của riêng component này

    // Cập nhật giá trị hiển thị khi serverId thay đổi (ví dụ: khi mở modal hoặc đổi step)
    useEffect(() => {
        if (serverId) {
            const currentServer = servers.find(s => s.id === serverId);
            const displayName = currentServer ? `${currentServer.name} (${currentServer.ip})` : '';
            setSearchTerm(displayName);
            setSelectedName(displayName);
        } else {
            setSearchTerm('');
            setSelectedName('');
        }
    }, [serverId, servers]); // Logic này đồng bộ prop (bên ngoài) vào state (bên trong)

    // Lọc server
    const filteredServers = useMemo(() => {
         // Nếu không có searchTerm, hiển thị tất cả
        if (!searchTerm) {
            return servers;
        }
        // Nếu searchTerm giống hệt tên đã chọn, ta cũng hiển thị tất cả (để user thấy các lựa chọn khác)
        if (searchTerm === selectedName) {
            return servers;
        }
        
        const lowerSearchTerm = searchTerm.toLowerCase();
        return servers.filter(server =>
            (server.name && server.name.toLowerCase().includes(lowerSearchTerm)) ||
            (server.ip && server.ip.toLowerCase().includes(lowerSearchTerm))
        );
    }, [servers, searchTerm, selectedName]);

    // Xử lý click-outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                // Nếu click ra ngoài, reset input về giá trị đã chọn
                setSearchTerm(selectedName);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownRef, selectedName]); // Phụ thuộc vào selectedName

    const handleSelect = (server) => {
        const displayName = `${server.name} (${server.ip})`;
        setSearchTerm(displayName);
        setSelectedName(displayName);
        setIsOpen(false);
        onChange(server.id); // Gọi hàm onChange của cha để cập nhật server_id
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-medium text-gray-600">Máy chủ <span className="text-red-500">*</span></label>
            <input
                type="text"
                value={searchTerm}
                // *** PHẦN SỬA LỖI QUAN TRỌNG ***
                onChange={(e) => {
                    const newSearchTerm = e.target.value;
                    setSearchTerm(newSearchTerm); // 1. Cập nhật state nội bộ để user thấy text họ gõ
                    setIsOpen(true);
                    
                    // 2. Chỉ cập nhật parent (onChange) nếu user cố tình xóa rỗng
                    if (newSearchTerm === '') {
                        setSelectedName('');
                        onChange(''); // Gửi ID rỗng lên component cha
                    } 
                    // 3. Nếu user gõ text khác, ta chỉ reset selectedName
                    // để biết user đang ở mode "search"
                    // KHÔNG GỌI onChange('') ở đây, nếu không sẽ gây vòng lặp
                    else if (newSearchTerm !== selectedName) {
                        setSelectedName('');
                    }
                }}
                onFocus={() => {
                    setIsOpen(true);
                }}
                placeholder="Nhập hostname hoặc IP để lọc..."
                className="mt-1 block w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                required={!serverId} // Yêu cầu nếu chưa có server nào được chọn
            />
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredServers.length > 0 ? (
                        filteredServers.map(server => (
                            <div
                                key={server.id}
                                onClick={() => handleSelect(server)}
                                className="p-2 hover:bg-sky-100 cursor-pointer"
                            >
                                <span className="font-semibold">{server.name}</span>
                                <span className="text-sm text-gray-600 ml-2">({server.ip})</span>
                            </div>
                        ))
                    ) : (
                        <div className="p-2 text-gray-500">Không tìm thấy máy chủ.</div>
                    )}
                </div>
            )}
        </div>
    );
};
// --- END: Component Con Combobox Server ---


// --- SỬA LỖI TRIỆT ĐỂ: Thay đổi props
// Xóa { db, setDb }
// Thêm { users } (được App.js truyền vào)
// THÊM MỚI: Thêm prop 'currentEnvironment'
const ScenarioManagementScreen = ({ user, users, onDataRefresh, isXlsxReady, currentEnvironment = 'TEST' }) => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingScenario, setEditingScenario] = useState(null);
    const [draggedStepIndex, setDraggedStepIndex] = useState(null);
    const [expandedStepIndex, setExpandedStepIndex] = useState(0);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    
    const [scenarioAttachment, setScenarioAttachment] = useState(null);
    
    // --- START: CẬP NHẬT STATE CHO TÌM KIẾM & LỌC ---
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce
    const [selectedScenarios, setSelectedScenarios] = useState([]);
    const [filterCreator, setFilterCreator] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterType, setFilterType] = useState(''); 
    // --- END: CẬP NHẬT STATE CHO TÌM KIẾM & LỌC ---

    // --- START: SỬA LỖI ESLINT (Bổ sung state đã mất) ---
    const [servers, setServers] = useState([]); // State server (cha)
    const [modalView, setModalView] = useState('selectType');

    // --- START: State cho Test Run (SỬA LỖI 409) ---
    const [isTestRunModalOpen, setIsTestRunModalOpen] = useState(false);
    const [testRunScenario, setTestRunScenario] = useState(null);
    const [testRunLogs, setTestRunLogs] = useState([]);
    // Trạng thái chi tiết: 
    // idle, 
    // api_pending (đang gọi POST /test_run), 
    // ws_connecting (API ok, đang kết nối WS), 
    // running (WS ok, đang chạy), 
    // finished (hoàn thành), 
    // failed (thất bại)
    const [testRunStatus, setTestRunStatus] = useState('idle');
    const [testRunError, setTestRunError] = useState(null);
    // --- END: State cho Test Run ---

    const testRunWs = useRef(null);
    const logContainerRef = useRef(null);

    // --- START: SỬA LỖI TRIỆT ĐỂ: State nội bộ cho dữ liệu (CẬP NHẬT CHO PHÂN TRANG) ---
    const [scenarios, setScenarios] = useState({}); // Vẫn dùng map để dễ dàng Cập nhật/Xóa
    // const [steps, setSteps] = useState({}); // <-- LOẠI BỎ: Sẽ tải khi cần
    // const [drills, setDrills] = useState([]); // <-- LOẠI BỎ: Sẽ kiểm tra ở backend

    // State cho phân trang
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false); // State khi tải thêm

    const [loadingData, setLoadingData] = useState(true); // State khi tải lần đầu
    const [dataError, setDataError] = useState(null);
    // --------------------------------------------------

    // Sửa lỗi: Đảm bảo user tồn tại trước khi truy cập user.role
    const initialRole = user ? (user.role === 'ADMIN' ? 'TECHNICAL' : user.role) : 'TECHNICAL';
    const initialFormState = { name: '', applicationName: '', role: initialRole, basis: '', status: 'Draft', type: 'MANUAL' };
    
    const initialStepState = [{ id: `temp-${Date.now()}`, title: '', description: '', estimated_time: '', dependsOn: [], server_id: '', server_user: '', command: '' }];
    // THÊM MỚI: State loading cho các bước trong modal
    const [loadingModalSteps, setLoadingModalSteps] = useState(false);

    const [formData, setFormData] = useState(initialFormState);
    const [stepInputs, setStepInputs] = useState(initialStepState);
    
    // --- START: SỬA LỖI TRIỆT ĐỂ: Hàm tải dữ liệu (CẬP NHẬT CHO PHÂN TRANG) ---
    const fetchScenarios = useCallback(async (pageToFetch) => {
        if (pageToFetch === 1) {
            setLoadingData(true); // Tải mới
        } else {
            setLoadingMore(true); // Tải thêm
        }
        setDataError(null);

        try {
            // Xây dựng query string
            const params = new URLSearchParams();
            params.append('page', pageToFetch);
            params.append('limit', 15); // Tải 25 mục mỗi lần
            if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
            if (filterCreator) params.append('creator', filterCreator);
            if (filterStatus) params.append('status', filterStatus);
            if (filterType) params.append('type', filterType);

            // 1. Tải kịch bản (đã phân trang)
            const scenariosRes = await fetch(`/api/ops/scenarios?${params.toString()}`, { credentials: 'include' });
            
            // 2. LOẠI BỎ tải steps
            // 3. LOẠI BỎ tải drills

            if (!scenariosRes.ok) {
                // --- START: XỬ LÝ LỖI 401 ---
                if (scenariosRes.status === 401) {
                    throw new Error('Phiên làm việc hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.');
                }
                // --- END: XỬ LÝ LỖI 401 ---
                throw new Error('Không thể tải dữ liệu kịch bản.');
            }

            const scenariosResult = await scenariosRes.json(); // API mới trả về { data: [...], pagination: {...} }
            const newScenariosData = scenariosResult.data || [];
            const pagination = scenariosResult.pagination;

            // Chuyển đổi mảng về object (map)
            const newScenariosMap = newScenariosData.reduce((acc, s) => {
                acc[s.id] = s;
                return acc;
            }, {});

            if (pageToFetch === 1) {
                setScenarios(newScenariosMap); // Thiết lập mới
            } else {
                setScenarios(prev => ({ ...prev, ...newScenariosMap })); // Nối thêm
            }

            // Cập nhật state phân trang
            setCurrentPage(pagination.page);
            setHasMore(pagination.page < pagination.totalPages);

        } catch (e) {
            console.error("Lỗi tải dữ liệu component:", e);
            setDataError("Lỗi tải dữ liệu. Vui lòng thử lại.");
        } finally {
            setLoadingData(false);
            setLoadingMore(false);
        }
    }, [debouncedSearchTerm, filterCreator, filterStatus, filterType]); // Phụ thuộc vào các bộ lọc

    // --- SỬA LỖI TRIỆT ĐỂ: Tải dữ liệu khi mount VÀ khi filter thay đổi ---
    useEffect(() => {
        // Tải trang đầu tiên khi filter thay đổi
        fetchScenarios(1);
    }, [fetchScenarios]); // fetchScenarios đã có dependencies là các filter

    useEffect(() => {
        // Chỉ tải server MỘT LẦN khi mount
        const fetchServers = async () => {
            try {
                const response = await fetch('/api/config/servers'); 
                if (!response.ok) {
                    throw new Error('Failed to fetch servers');
                }
                const data = await response.json();
                const formattedServers = data.map(server => ({ 
                    id: server.id, 
                    name: server.hostname, 
                    ip: server.ip_address || 'N/A' 
                }));
                setServers(formattedServers);
            } catch (error) {
                console.error("Error fetching servers:", error);
            }
        };
        fetchServers(); 
    }, []); // Rỗng để chạy 1 lần


    // ... (các hàm xử lý cũ) ...
    const handleAddStep = () => {
        const newStep = { 
            id: `temp-${Date.now()}`, 
            title: '', 
            description: '', 
            estimated_time: '', 
            dependsOn: [],
            server_id: '',
            server_user: '',
            command: ''
        };
        setStepInputs([...stepInputs, newStep]);
        setExpandedStepIndex(stepInputs.length); // Mở bước mới
    };
    
    const handleRemoveStep = (index) => {
        const removedStepId = stepInputs[index].id;
        const newSteps = stepInputs.filter((_, i) => i !== index);
        const updatedSteps = newSteps.map(step => ({
            ...step,
            dependsOn: (step.dependsOn || []).filter(id => id !== removedStepId)
        }));
        setStepInputs(updatedSteps);
    };

    const handleStepChange = (index, field, value) => {
        const newSteps = [...stepInputs];
        newSteps[index][field] = value;
        setStepInputs(newSteps);
    };
    
    const handleFormChange = (field, value) => {
        const newFormData = {...formData, [field]: value};
        if (field === 'type') {
            setStepInputs(initialStepState);
            setExpandedStepIndex(0);
        }
        setFormData(newFormData);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
            alert(`Lỗi: Kích thước tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 5MB.`);
            e.target.value = null;
            return;
        }

        if (file.type === "application/pdf") {
            setScenarioAttachment({
                file: file,
                name: file.name
            });
        } else {
            alert('Chỉ chấp nhận tệp định dạng PDF.');
            e.target.value = null;
        }
    };

    const handleRemoveAttachment = () => {
        setScenarioAttachment(null);
    };

    // --- START: CẬP NHẬT `handleOpenModal` ĐỂ LAZY LOAD CÁC BƯỚC ---
    const handleOpenModal = async (scenarioToEdit = null, isClone = false, importedData = null) => {
        if (!user) return; // Guard clause nếu user chưa tải

        setLoadingModalSteps(false); // Reset
        setExpandedStepIndex(0);

        if (importedData) {
            // Logic import (đã có steps)
            setEditingScenario(null);
            setFormData({ ...initialFormState, name: importedData.name, type: 'MANUAL', role: user.role === 'ADMIN' ? 'TECHNICAL' : user.role });
            setStepInputs(importedData.steps);
            setScenarioAttachment(null);
            setModalView('form');
            setIsModalOpen(true);
        } else if (scenarioToEdit) {
            // Logic Chỉnh sửa (Edit) hoặc Nhân bản (Clone)
            setEditingScenario(isClone ? null : scenarioToEdit);
            
            let scenarioType = scenarioToEdit.type || 'MANUAL';
            // (Logic phát hiện type tự động)
            if (!scenarioToEdit.type && scenarioToEdit.steps && scenarioToEdit.steps.length > 0) {
                // Tạm thời bỏ qua, vì chúng ta chưa tải steps
            }

            setFormData({ 
                name: isClone ? `${scenarioToEdit.name} (Copy)` : scenarioToEdit.name, 
                applicationName: scenarioToEdit.application_name || '', 
                role: scenarioToEdit.role, 
                basis: scenarioToEdit.basis, 
                status: scenarioToEdit.status,
                type: scenarioType
            });
            setScenarioAttachment(scenarioToEdit.attachment || null);
            
            // Mở modal ngay lập tức
            setModalView('form');
            setIsModalOpen(true);
            
            // Đặt trạng thái loading
            setStepInputs(initialStepState); // Đặt state trống
            setLoadingModalSteps(true); // Bắt đầu loading

            try {
                // Tải các bước cho kịch bản này
                const response = await fetch(`/api/ops/scenarios/${scenarioToEdit.id}/steps`);
                if (!response.ok) {
                    throw new Error('Không thể tải chi tiết các bước của kịch bản.');
                }
                const stepsForScenario = await response.json();

                // Cập nhật lại logic kiểm tra type (nếu cần)
                if (!scenarioToEdit.type && stepsForScenario.length > 0) {
                     const firstStep = stepsForScenario[0];
                    if (firstStep.command !== undefined || firstStep.server_id !== undefined) {
                        scenarioType = 'AUTOMATION';
                        setFormData(prev => ({...prev, type: 'AUTOMATION'}));
                    }
                }

                // Nếu nhân bản (clone), chúng ta cần xóa ID của các bước
                if (isClone) {
                    // FIX: Thêm index để đảm bảo ID duy nhất khi vòng lặp chạy quá nhanh
                    const clonedSteps = stepsForScenario.map((step, index) => {
                        const { id, ...rest } = step;
                        // Sử dụng cả Date.now() và index để đảm bảo key duy nhất
                        return { ...rest, id: `temp-clone-${Date.now()}-${index}` };
                    });
                    setStepInputs(clonedSteps.length > 0 ? clonedSteps : initialStepState);
                } else {
                    setStepInputs(stepsForScenario.length > 0 ? stepsForScenario : initialStepState);
                }

            } catch (error) {
                console.error("Lỗi tải các bước:", error);
                alert(`Lỗi: ${error.message}`);
                setIsModalOpen(false); // Đóng modal nếu tải steps thất bại
            } finally {
                setLoadingModalSteps(false); // Kết thúc loading
            }
            
        } else {
            // Logic Tạo mới (New)
            setEditingScenario(null);
            setFormData({ ...initialFormState, role: user.role === 'ADMIN' ? 'TECHNICAL' : user.role });
            setStepInputs(initialStepState);
            setScenarioAttachment(null);
            setModalView('selectType'); 
            setIsModalOpen(true);
        }
    };
    // --- END: CẬP NHẬT `handleOpenModal` ---


    const handleSave = async (e) => {
        e.preventDefault();

        if (!user) {
             alert('Lỗi: Phiên làm việc không hợp lệ. Vui lòng tải lại trang.');
             return;
        }
        
        // --- SỬA LỖI ESLINT: Định nghĩa trimmedName/AppName sớm ---
        const trimmedName = formData.name.trim();
        const trimmedAppName = formData.applicationName.trim();
        // --- END SỬA LỖI ---

        if (!trimmedName || !trimmedAppName) {
            alert('Vui lòng nhập tên kịch bản và tên ứng dụng.');
            return;
        }

        // Sửa lỗi: Đảm bảo scenarios tồn tại
        // --- SỬA LỖI ESLINT: Di chuyển check duplicate xuống sau khi định nghĩa trimmedName ---
        const isDuplicate = scenarios && Object.values(scenarios).some(
            s => s.name.toLowerCase() === trimmedName.toLowerCase() && s.id !== (editingScenario ? editingScenario.id : null)
        );

        if (isDuplicate) {
            alert('Lỗi: Tên kịch bản này đã tồn tại. Vui lòng chọn một tên khác.');
            return;
        }
        
        for (const step of stepInputs) {
            if (!step.title.trim()) {
                alert('Vui lòng nhập Tên bước cho tất cả các bước.');
                return;
            }
            if (formData.type === 'MANUAL' && (!step.description.trim() || step.description.trim() === "<p><br></p>")) {
                alert('Vui lòng nhập Mô tả cho tất cả các bước của kịch bản Thủ công.');
                return;
            }
            if (formData.type === 'AUTOMATION' && (!step.server_id || !step.command.trim())) {
                alert('Vui lòng chọn Máy chủ và nhập Câu lệnh cho tất cả các bước của kịch bản Tự động hóa.');
                return;
            }
        }
        
        try {
            let finalAttachmentPayload = null;
            if (scenarioAttachment) {
                if (scenarioAttachment.file) {
                    const readFileAsDataURL = (file) => {
                         return new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = (error) => reject(error);
                            reader.readAsDataURL(file);
                        });
                    };
                    const base64String = await readFileAsDataURL(scenarioAttachment.file);
                    finalAttachmentPayload = {
                        name: scenarioAttachment.name,
                        data: base64String,
                    };
                } else {
                    finalAttachmentPayload = scenarioAttachment;
                }
            }
            
            const cleanedSteps = stepInputs.map(step => {
                let finalStep = step;
                
                if (formData.type === 'MANUAL') {
                    const { server_id, server_user, command, ...manualStep } = finalStep;
                    return manualStep;
                } else { // AUTOMATION
                    const { description, estimated_time, ...automationStep } = finalStep;
                    return automationStep;
                }
            });

            const payload = {
                ...formData,
                name: trimmedName, // <-- SỬA LỖI: 'trimmedName' giờ đã được định nghĩa
                applicationName: trimmedAppName, // <-- SỬA LỖI: 'trimmedAppName' giờ đã được định nghĩa
                status: formData.basis ? formData.status : 'Draft',
                created_by: user.id,
                steps: cleanedSteps,
                attachment: finalAttachmentPayload,
            };

            let response;
            if (editingScenario) {
                response = await fetch(`/api/ops/scenarios/${editingScenario.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                response = await fetch('/api/ops/scenarios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Lỗi không xác định' }));
                console.error('Save error:', errorData);
                throw new Error(errorData.message || 'Failed to save scenario');
            }
            
            setIsModalOpen(false);
            // onDataRefresh(); // onDataRefresh của App chỉ tải users
            fetchScenarios(1); // <-- SỬA LỖI: Tải lại trang đầu tiên
        } catch (error) {
            console.error(error);
            alert(`Lỗi lưu kịch bản: ${error.message}`);
        }
    };
    
    const handleStatusChange = async (scenarioId, newStatus) => {
        try {
            const response = await fetch(`/api/ops/scenarios/${scenarioId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!response.ok) throw new Error('Failed to update scenario status');
            
            // CẬP NHẬT: Thay vì tải lại toàn bộ, chỉ cập nhật state
            setScenarios(prev => ({
                ...prev,
                [scenarioId]: { ...prev[scenarioId], status: newStatus }
            }));
            
        } catch (error) {
            console.error(error);
            alert('Lỗi cập nhật trạng thái kịch bản.');
        }
    };

    // --- LOẠI BỎ `isScenarioInUse` ---
    // (Vì state `drills` đã bị xóa. Backend sẽ thực hiện việc này.)
    /*
    const isScenarioInUse = (scenarioId) => {
        return []; // Luôn trả về rỗng
    };
    */

    const handleRequestDeletion = (scenarioId) => {
        // [CẬP NHẬT] Bỏ qua kiểm tra drills ở frontend
        /*
        const drillsInUse = isScenarioInUse(scenarioId);
        if (drillsInUse.length > 0) {
            ...
        }
        */

        setConfirmModal({
            isOpen: true,
            message: t('requestDeleteConfirmation'),
            onConfirm: () => {
                handleStatusChange(scenarioId, 'Pending Deletion');
                setConfirmModal({ isOpen: false, message: '', onConfirm: null });
            }
        });
    };
    
    // --- START: SỬA LỖI LOGIC XÓA ---
    const handleApproveDeletion = (scenarioId) => {
        // [CẬP NHẬT] Bỏ qua kiểm tra drills ở frontend

        setConfirmModal({
            isOpen: true,
            message: t('deleteConfirmation'),
            onConfirm: async () => {
                try {
                    const response = await fetch(`/api/ops/scenarios/${scenarioId}`, { method: 'DELETE' });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ message: 'Không thể xóa. Lỗi không xác định.' }));
                        throw new Error(errorData.message);
                    }

                    // Tải lại dữ liệu (đơn giản nhất)
                    fetchScenarios(1);
                    setSelectedScenarios([]); // Xóa lựa chọn
                    
                } catch (error) {
                    console.error(error);
                    alert(`Lỗi xóa kịch bản: ${error.message}`);
                } finally {
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                }
            }
        });
    };
    // --- END: SỬA LỖI LOGIC XÓA ---
    
    const handleRejectDeletion = (scenarioId) => {
        handleStatusChange(scenarioId, 'Draft');
    };

    // --- START: SỬA LỖI (FIX) CRASH TRANG TRẮNG ---
    const filteredScenarios = useMemo(() => {
        // SỬA LỖI (FIX): Thêm kiểm tra (guard clause)
        // scenarios và user có thể là undefined/null trong lần render đầu tiên
        if (!scenarios || !user) {
            return []; // Trả về mảng rỗng để tránh crash
        }

        // Sửa lỗi: dùng state 'scenarios' nội bộ
        // CẬP NHẬT: Không cần lọc nữa, vì API đã lọc rồi
        // Chúng ta chỉ cần chuyển map thành array
        return Object.values(scenarios);
        
        /* // LOGIC LỌC CŨ (ĐÃ CHUYỂN VỀ BACKEND)
        return Object.values(scenarios).filter(s => {
            const userFilter = user.role === 'ADMIN' || s.created_by === user.id; // user đã được kiểm tra
            const searchFilter = searchTerm === '' 
                || s.name.toLowerCase().includes(searchTerm.toLowerCase()) 
                || (s.application_name && s.application_name.toLowerCase().includes(searchTerm.toLowerCase()));
            const creatorFilter = !filterCreator || s.created_by === filterCreator;
            const statusFilter = !filterStatus || s.status === filterStatus;
            // Thêm logic lọc theo loại, gán 'MANUAL' làm mặc định nếu 'type' không tồn tại
            const typeFilter = !filterType || (s.type || 'MANUAL') === filterType;
            return userFilter && searchFilter && creatorFilter && statusFilter && typeFilter;
        });
        */
    }, [scenarios, user]); // Chỉ phụ thuộc vào scenarios và user
    // --- END: SỬA LỖI (FIX) CRASH TRANG TRẮNG ---


    const creators = useMemo(() => {
        // Sửa lỗi: Guard clause
        // Sửa lỗi: dùng props 'users' và state 'scenarios'
        // CẬP NHẬT: Vì scenarios giờ chỉ là 1 trang, danh sách này sẽ không đầy đủ
        // Tốt hơn là nên để API trả về danh sách người tạo,
        // nhưng tạm thời chúng ta sẽ dùng danh sách users
        if (!users) {
            return [];
        }
        // const creatorIds = new Set(Object.values(scenarios).map(s => s.created_by));
        // return users.filter(u => creatorIds.has(u.id));
        return users; // Hiển thị tất cả user
    }, [users]); // Phụ thuộc vào users

    const statuses = ['Draft', 'Pending Approval', 'Active', 'Rejected', 'Pending Deletion'];

    const handleSelectScenario = (scenarioId) => {
        setSelectedScenarios(prev => 
            prev.includes(scenarioId) 
            ? prev.filter(id => id !== scenarioId)
            : [...prev, scenarioId]
        );
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedScenarios(filteredScenarios.map(s => s.id));
        } else {
            setSelectedScenarios([]);
        }
    };

    // --- START: SỬA LỖI LOGIC XÓA HÀNG LOẠT ---
    const handleDeleteSelected = () => {
        if (!scenarios) return; // Sửa lỗi: Guard clause

        // [CẬP NHẬT] Bỏ qua kiểm tra drills ở frontend
        
        setConfirmModal({
            isOpen: true,
            message: `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedScenarios.length} kịch bản đã chọn không? Backend sẽ kiểm tra lại lần cuối. Thao tác này không thể hoàn tác.`,
            onConfirm: async () => {
                let successCount = 0;
                let errorMessages = [];
                
                // Chạy tuần tự thay vì Promise.all để tránh race condition
                for (const id of selectedScenarios) {
                    try {
                        const response = await fetch(`/api/ops/scenarios/${id}`, { method: 'DELETE' });
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ message: 'Lỗi không xác định' }));
                            // Thêm tên kịch bản vào thông báo lỗi
                            const scenarioName = scenarios[id]?.name || id;
                            errorMessages.push(`- ${scenarioName}: ${errorData.message}`);
                        } else {
                            successCount++;
                        }
                    } catch (error) {
                         const scenarioName = scenarios[id]?.name || id;
                         errorMessages.push(`- ${scenarioName}: ${error.message}`);
                    }
                }
                
                // Tải lại dữ liệu bất kể kết quả
                fetchScenarios(1);
                setSelectedScenarios([]);

                // Hiển thị kết quả
                if (errorMessages.length > 0) {
                    alert(`Xóa ${successCount} kịch bản thành công.\n\nKhông thể xóa ${errorMessages.length} kịch bản:\n${errorMessages.join('\n')}`);
                } else {
                    alert(`Đã xóa thành công ${successCount} kịch bản.`);
                }
                
                setConfirmModal({ isOpen: false, message: '', onConfirm: null });
            }
        });
    };
    // --- END: SỬA LỖI LOGIC XÓA HÀNG LOẠT ---

    const handleDragStart = (e, index) => {
        setDraggedStepIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragOver = (e) => e.preventDefault();
    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        if (draggedStepIndex === null) return;
        const newSteps = [...stepInputs];
        const draggedItem = newSteps[draggedStepIndex];
        newSteps.splice(draggedStepIndex, 1);
        newSteps.splice(targetIndex, 0, draggedItem);
        setStepInputs(newSteps);
        setDraggedStepIndex(null);
    };
    
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN')}`;
    };

    const getStatusClass = (status) => {
        switch(status) {
            case 'Active': return 'bg-green-100 text-green-800';
            case 'Pending Approval': return 'bg-yellow-100 text-yellow-800';
            case 'Rejected': return 'bg-red-100 text-red-800';
            case 'Pending Deletion': return 'bg-orange-100 text-orange-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };
    
    const handleDownloadTemplate = () => {
        if (typeof window.XLSX === 'undefined') {
            alert(t('excelLibraryNotReady'));
            return;
        }
        const headers = ['STT', 'Tên bước', 'Mô tả (HTML)', 'Thời gian dự kiến (hh:mm:ss)', 'Phụ thuộc (STT bước trước, cách nhau bởi dấu phẩy)'];
        const sampleData = [
            [1, 'Khởi động hệ thống A', 'Bước 1: Bật nguồn.\nBước 2: Kiểm tra đèn.', '00:10:00', ''],
            [2, 'Đăng nhập vào hệ thống B', 'Sử dụng tài khoản admin để đăng nhập.', '00:05:00', '1'],
        ];
        const data = [headers, ...sampleData];
        const ws = window.XLSX.utils.aoa_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Scenario Template");
        window.XLSX.writeFile(wb, "Scenario_Template.xlsx");
    };

    const handleFileImport = (e) => {
        if (typeof window.XLSX === 'undefined') {
            alert(t('excelLibraryNotReady'));
            return;
        }
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = window.XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = window.XLSX.utils.sheet_to_json(worksheet);

                const tempSteps = json.map((row, index) => ({
                    id: `temp-import-${Date.now()}-${index}`,
                    stt: row['STT'],
                    title: row['Tên bước'] || '',
                    description: (row['Mô tả (HTML)'] || '').replace(/\r?\n/g, '<br />'),
                    estimated_time: row['Thời gian dự kiến (hh:mm:ss)'] || '',
                    dependsOnRaw: String(row['Phụ thuộc (STT bước trước, cách nhau bởi dấu phẩy)'] || '').trim(),
                }));

                const finalSteps = tempSteps.map(step => {
                    let dependsOn = [];
                    if (step.dependsOnRaw) {
                        const depNumbers = step.dependsOnRaw.split(',').map(n => parseInt(n.trim(), 10));
                        depNumbers.forEach(num => {
                            const foundDep = tempSteps.find(s => s.stt === num);
                            if (foundDep) {
                                dependsOn.push(foundDep.id);
                            }
                        });
                    }
                    return { id: step.id, title: step.title, description: step.description, estimated_time: step.estimated_time, dependsOn };
                });

                const scenarioName = file.name.replace(/\.(xlsx|xls|csv)$/i, '');
                handleOpenModal(null, false, { name: scenarioName, steps: finalSteps });

            } catch (error) {
                console.error("Error parsing Excel file:", error);
                alert(t('importError'));
            } finally {
                setIsImporting(false);
                e.target.value = null; 
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Hàm xử lý khi mở rộng một bước (chỉ quản lý accordion)
    const handleToggleExpandStep = (index) => {
        if (expandedStepIndex === index) {
            setExpandedStepIndex(null); // Đóng bước
        } else {
            setExpandedStepIndex(index); // Mở bước
        }
    };

    // --- START: Hàm cho Test Run (SỬA LỖI 409) ---

    // 1. Mở Modal (CHỈ MỞ MODAL, KHÔNG GỌI API)
    const handleOpenTestRunModal = async (scenario) => {
        setTestRunScenario(scenario);
        setIsTestRunModalOpen(true);
        setTestRunLogs([]);
        setTestRunStatus('ws_connecting'); // 1. Đặt trạng thái: Đang kết nối WS
        setTestRunError(null);
    };

    // 2. Đóng Modal
    const handleCloseTestRunModal = () => {
        // --- BẮT ĐẦU SỬA LỖI (NGẮT PHIÊN) ---
        // Nếu đang chạy, gửi tín hiệu 'ABORT_RUN' trước khi đóng
        if (testRunStatus === 'running' || testRunStatus === 'ws_connecting' || testRunStatus === 'api_pending') {
            if (testRunWs.current && testRunWs.current.readyState === 1) { // 1 = WebSocket.OPEN
                console.log('[Test Run WS] Đang gửi tín hiệu ABORT_RUN...');
                testRunWs.current.send(JSON.stringify({ type: 'ABORT_RUN' }));
            }
        }
        // --- KẾT THÚC SỬA LỖI (NGẮT PHIÊN) ---

        setIsTestRunModalOpen(false);
        setTestRunScenario(null);
        setTestRunStatus('idle'); // Reset trạng thái
        // WebSocket sẽ được đóng tự động bởi useEffect cleanup
    };

    // 3. Effect quản lý WebSocket (ĐÃ SỬA LOGIC)
    useEffect(() => {
        // --- SỬA LỖI 409: Chỉ chạy khi trạng thái là 'ws_connecting' HOẶC modal đang mở ---
        if ((isTestRunModalOpen || testRunStatus === 'ws_connecting') && testRunScenario) {
            const scenarioId = testRunScenario.id;
            
            // 1. Xác định địa chỉ WebSocket
            // Dựa theo file websocket.js, path là: /ws/scenario_test/:scenarioId
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const host = window.location.host;
            
            // --- START: SỬA LỖI ĐƯỜNG DẪN WEBSOCKET ---
            // Xóa bỏ /api/config/ để khớp với file websocket.js của bạn
            const wsUrl = `${protocol}://${host}/ws/scenario_test/${scenarioId}`;
            // --- END: SỬA LỖI ĐƯỜNG DẪN WEBSOCKET ---
            
            console.log(`[Test Run WS] Connecting to ${wsUrl}`);

            // 2. Khởi tạo WebSocket
            const ws = new WebSocket(wsUrl);
            testRunWs.current = ws;

            // 3. Định nghĩa các trình xử lý sự kiện
            ws.onopen = async () => {
                console.log(`[Test Run WS] Connected for scenario ${scenarioId}`);
                setTestRunStatus('running'); // 4. WS Thành công -> Đặt trạng thái: Đang chạy
                setTestRunLogs(prev => [...prev, '[WebSocket] Kết nối thành công. Đang gửi yêu cầu chạy...']);

                // --- START: SỬA LỖI RACE CONDITION ---
                // Chỉ gọi API KHI WebSocket đã mở (đồng bộ với ExecutionScreen)
                try {
                    const response = await fetch(`/api/ops/scenarios/${scenarioId}/test_run`, {
                        method: 'POST'
                    });
                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.message || 'Lỗi khi bắt đầu chạy thử');
                    }
                    // API đã nhận lệnh, chờ log...
                    setTestRunLogs(prev => [...prev, '[API] Yêu cầu chạy đã được gửi thành công. Đang chờ log...']);
                } catch (error) {
                    console.error("Lỗi API chạy thử (trong onopen):", error);
                    setTestRunStatus('failed');
                    setTestRunError(error.message);
                    ws.close(); // Đóng WS nếu API thất bại
                }
                // --- END: SỬA LỖI RACE CONDITION ---
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'log') {
                        setTestRunLogs(prev => [...prev, message.data]);
                    } 
                    // SỬA LỖI: Lắng nghe cả FAILED từ backend
                    else if (message.type === 'control') {
                        if (message.data === 'TEST_RUN_COMPLETE') {
                            setTestRunStatus('finished');
                            setTestRunLogs(prev => [...prev, '\n[WebSocket] === Chạy thử hoàn tất ===']);
                            // ws.close(); // <-- SỬA LỖI: Xóa dòng này. Để backend tự đóng.
                        } else if (message.data === 'TEST_RUN_FAILED') {
                            setTestRunStatus('failed');
                            setTestRunLogs(prev => [...prev, '\n[WebSocket] === Chạy thử thất bại (báo cáo từ server) ===']);
                            // ws.close(); // <-- SỬA LỖI: Xóa dòng này. Để backend tự đóng.
                        // --- BẮT ĐẦU SỬA LỖI (NGẮT PHIÊN) ---
                        } else if (message.data === 'TEST_RUN_ABORTED') {
                            setTestRunStatus('failed'); // Coi như thất bại
                            setTestRunLogs(prev => [...prev, '\n[WebSocket] === Đã ngắt phiên (báo cáo từ server) ===']);
                        }
                        // --- KẾT THÚC SỬA LỖI (NGẮT PHIÊN) ---
                    }
                } catch (e) {
                    console.error('[Test Run WS] Error parsing message:', e);
                    setTestRunLogs(prev => [...prev, `[WebSocket] Lỗi đọc log: ${event.data}`]);
                }
            };

            ws.onclose = (event) => {
                console.log(`[Test Run WS] Disconnected (Code: ${event.code})`);
                setTestRunStatus(prev => {
                    // Nếu đang chạy/kết nối mà bị ngắt (lỗi 1006)
                    if (prev === 'running' || prev === 'ws_connecting') { 
                        setTestRunError(`Mất kết nối WebSocket (Code: ${event.code}).`);
                        return 'failed'; // 5. WS Lỗi -> Đặt trạng thái: Thất bại
                    }
                    return prev; // Giữ nguyên 'finished' hoặc 'failed'
                });
            };

            ws.onerror = (error) => {
                console.error('[Test Run WS] Error:', error);
                setTestRunError('Lỗi kết nối WebSocket. Kiểm tra console (F12) và đường truyền.');
                setTestRunStatus('failed'); // 5. WS Lỗi -> Đặt trạng thái: Thất bại
            };

            // 4. Hàm cleanup
            return () => {
                if (ws) {
                    console.log(`[Test Run WS] Closing connection for scenario ${scenarioId}`);
                    ws.close();
                }
                testRunWs.current = null;
            };
        }
    }, [isTestRunModalOpen, testRunScenario]); // <-- SỬA LỖI: Trigger bằng isTestRunModalOpen
    

    // 4. Tự động cuộn log
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [testRunLogs]); 

    // --- END: Hàm cho Test Run ---

    // Sửa lỗi: Guard clause nếu user chưa tải
    if (!user) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-lg text-center">
                <p className="text-gray-700">Đang tải dữ liệu người dùng...</p>
            </div>
        );
    }

    // --- SỬA LỖI TRIỆT ĐỂ: Thêm màn hình loading/error ---
    if (loadingData && currentPage === 1) { // Chỉ hiển thị loading toàn trang khi tải trang 1
        return (
            <div className="bg-white p-6 rounded-2xl shadow-lg text-center">
                <p className="text-gray-700">Đang tải dữ liệu kịch bản...</p>
            </div>
        );
    }

    if (dataError) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-lg text-center">
                <p className="text-red-600">{dataError}</p>
                <button onClick={() => fetchScenarios(1)} className="mt-4 bg-[#00558F] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#004472]">
                    Thử lại
                </button>
            </div>
        );
    }
    // --------------------------------------------------

    return (
        <>
            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                    <h2 className="text-xl font-bold text-gray-900">{t('scenarioList')}</h2>
                    <div className="flex items-center space-x-2">
                        {selectedScenarios.length > 0 && user.role === 'ADMIN' ? (
                             <button onClick={handleDeleteSelected} className="flex items-center bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors">
                                <DeleteIcon /> <span className="ml-2">Xóa ({selectedScenarios.length})</span>
                            </button>
                        ) : (
                            <>
                                <button onClick={handleDownloadTemplate} disabled={!isXlsxReady || isImporting} className="flex items-center bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    <DownloadIcon /> <span className="hidden sm:inline ml-2">{t('downloadTemplate')}</span>
                                </button>
                                <button onClick={() => fileInputRef.current.click()} disabled={!isXlsxReady || isImporting} className="flex items-center bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isImporting ? t('importing') : <><UploadIcon /> <span className="hidden sm:inline ml-2">{t('importFromExcel')}</span></>}
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".xlsx, .xls" />
                                <button onClick={() => handleOpenModal()} className="bg-[#00558F] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#004472]">{t('createNewScenario')}</button>
                            </>
                        )}
                    </div>
                </div>
                
                {/* --- SỬA LỖI: THAY ĐỔI GRID TỪ 3 SANG 4 CỘT --- */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-gray-200">
                    <div>
                        <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">Tìm kiếm</label>
                        <input id="search" type="text" placeholder="Theo tên kịch bản, ứng dụng..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" />
                    </div>
                    <div>
                        <label htmlFor="creatorFilter" className="block text-sm font-medium text-gray-700 mb-1">Người tạo</label>
                        <select id="creatorFilter" value={filterCreator} onChange={e => setFilterCreator(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                            <option value="">Tất cả người tạo</option>
                            {creators.map(creator => (<option key={creator.id} value={creator.id}>{creator.username}</option>))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                        <select id="statusFilter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                            <option value="">Tất cả trạng thái</option>
                            {statuses.map(status => (<option key={status} value={status}>{t(status.toLowerCase().replace(/ /g, '')) || status}</option>))}
                        </select>
                    </div>
                    {/* --- THÊM BỘ LỌC MỚI --- */}
                    <div>
                        <label htmlFor="typeFilter" className="block text-sm font-medium text-gray-700 mb-1">Loại kịch bản</label>
                        <select id="typeFilter" value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                            <option value="">Tất cả các loại</option>
                            <option value="MANUAL">Thủ công</option>
                            <option value="AUTOMATION">Tự động</option>
                        </select>
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                         <thead className="border-b border-gray-200">
                            <tr>
                                {user.role === 'ADMIN' && (<th className="py-3 px-4 w-12"><input type="checkbox" className="rounded" onChange={handleSelectAll} checked={filteredScenarios.length > 0 && selectedScenarios.length === filteredScenarios.length} /></th>)}
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('scenarioName')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Loại</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('application')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('status')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('creator')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('lastUpdated')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('action')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredScenarios.map(s => {
                                // Sửa lỗi: Guard clause
                                // Sửa lỗi: dùng prop 'users'
                                const creator = users ? users.find(u => u.id === s.created_by) : null;
                                const isSelected = selectedScenarios.includes(s.id);
                                const type = s.type || 'MANUAL'; // Fallback for older data
                                // THÊM MỚI: Kiểm tra môi trường
                                const isProduction = currentEnvironment === 'PRODUCTION';
                                return (
                                <tr key={s.id} className={`border-b border-gray-100 ${isSelected ? 'bg-sky-50' : 'hover:bg-gray-50'}`}>
                                    {user.role === 'ADMIN' && (<td className="py-3 px-4"><input type="checkbox" className="rounded" checked={isSelected} onChange={() => handleSelectScenario(s.id)} /></td>)}
                                    <td className="py-3 px-4 text-gray-800">{s.name}</td>
                                    <td className="py-3 px-4">
                                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${type === 'AUTOMATION' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-800'}`}>
                                            {type === 'AUTOMATION' ? 'Tự động' : 'Thủ công'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-gray-600">{s.application_name}</td>
                                    <td className="py-3 px-4"><span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusClass(s.status)}`}>{t(s.status.toLowerCase().replace(' ', '')) || s.status}</span></td>
                                    <td className="py-3 px-4 text-gray-600">{creator ? creator.username : 'N/A'}</td>
                                    <td className="py-3 px-4 text-gray-600">{formatDate(s.last_updated_at)}</td>
                                    {/* --- START SỬA LỖI UI (FIX 1) --- */}
                                    <td className="py-3 px-4 relative z-10">
                                    {/* --- END SỬA LỖI UI (FIX 1) --- */}
                                        <div className="flex items-center space-x-2">
                                            {selectedScenarios.length === 0 && (
                                                <>
                                                    {/* --- START: THÊM NÚT TEST RUN --- */}
                                                    {/* SỬA ĐỔI: Thêm điều kiện !isProduction */}
                                                    {s.type === 'AUTOMATION' && !isProduction && (
                                                        <button 
                                                            onClick={() => handleOpenTestRunModal(s)} 
                                                            title="Chạy thử kịch bản" 
                                                            className="p-2 rounded-lg text-green-600 bg-green-100 hover:bg-green-200"
                                                        >
                                                            <PlayIcon />
                                                        </button>
                                                    )}
                                                    {/* --- END: THÊM NÚT TEST RUN --- */}

                                                    {(user.role === 'ADMIN' || user.id === s.created_by) && s.status !== 'Pending Deletion' && (
                                                        <>
                                                            <button onClick={() => handleOpenModal(s)} title={t('edit')} className="p-2 rounded-lg text-yellow-600 bg-yellow-100 hover:bg-yellow-200"><EditIcon /></button>
                                                            <button onClick={() => handleOpenModal(s, true)} title={t('clone')} className="p-2 rounded-lg text-purple-600 bg-purple-100 hover:bg-purple-200"><CloneIcon /></button>
                                                        </>
                                                    )}
                                                    {user.role !== 'ADMIN' && s.status === 'Draft' && s.basis && (
                                                        <button onClick={() => handleStatusChange(s.id, 'Pending Approval')} title={t('submitForApproval')} className="p-2 rounded-lg text-blue-600 bg-blue-100 hover:bg-blue-200"><SubmitApprovalIcon /></button>
                                                    )}
                                                    {user.role === 'ADMIN' && s.status === 'Pending Approval' && (
                                                        <>
                                                            <button onClick={() => handleStatusChange(s.id, 'Active')} title={t('approve')} className="p-2 rounded-lg text-green-600 bg-green-100 hover:bg-green-200"><ApproveIcon /></button>
                                                            <button onClick={() => handleStatusChange(s.id, 'Rejected')} title={t('reject')} className="p-2 rounded-lg text-red-600 bg-red-100 hover:bg-red-200"><RejectIcon /></button>
                                                        </>
                                                    )}
                                                    {user.role !== 'ADMIN' && (user.id === s.created_by) && s.status !== 'Pending Deletion' && (
                                                        <button onClick={() => handleRequestDeletion(s.id)} title={t('requestDeletion')} className="p-2 rounded-lg text-red-600 bg-red-100 hover:bg-red-200"><DeleteIcon /></button>
                                                    )}
                                                    {user.role === 'ADMIN' && s.status !== 'Pending Deletion' && (
                                                        <button onClick={() => handleApproveDeletion(s.id)} title={t('delete')} className="p-2 rounded-lg text-red-600 bg-red-100 hover:bg-red-200"><DeleteIcon /></button>
                                                    )}
                                                    {user.role === 'ADMIN' && s.status === 'Pending Deletion' && (
                                                        <>
                                                            <button onClick={() => handleApproveDeletion(s.id)} title={t('approveDeletion')} className="p-2 rounded-lg text-green-600 bg-green-100 hover:bg-green-200"><ApproveIcon /></button>
                                                            <button onClick={() => handleRejectDeletion(s.id)} title={t('rejectDeletion')} className="p-2 rounded-lg text-red-600 bg-red-100 hover:bg-red-200"><RejectIcon /></button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>

                {/* --- START: NÚT TẢI THÊM --- */}
                <div className="mt-6 flex justify-center">
                    {hasMore && (
                        <button 
                            onClick={() => fetchScenarios(currentPage + 1)} 
                            disabled={loadingMore}
                            className="bg-sky-100 text-sky-700 font-semibold py-2 px-6 rounded-lg hover:bg-sky-200 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        >
                            {loadingMore ? 'Đang tải...' : 'Tải thêm'}
                        </button>
                    )}
                    {!hasMore && filteredScenarios.length > 0 && (
                         <p className="text-gray-500">Đã hiển thị tất cả kịch bản.</p>
                    )}
                    {filteredScenarios.length === 0 && !loadingData && (
                        <p className="text-gray-500">Không tìm thấy kịch bản nào phù hợp.</p>
                    )}
                </div>
                {/* --- END: NÚT TẢI THÊM --- */}

            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        
                        { modalView === 'selectType' ? ( // <-- SỬA LỖI: Cần 'modalView'
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Chọn loại kịch bản</h3>
                                <p className="text-gray-600 mb-6">Vui lòng chọn loại kịch bản bạn muốn tạo.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button 
                                        type="button"
                                        onClick={() => { handleFormChange('type', 'MANUAL'); setModalView('form'); }} // <-- SỬA LỖI: Cần 'setModalView'
                                        className="text-left p-4 border border-gray-300 rounded-lg hover:bg-sky-50 hover:border-sky-500 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    >
                                        <h4 className="font-bold text-gray-800">Thủ công (Manual)</h4>
                                        <p className="text-sm text-gray-600 mt-1">Tạo kịch bản với các bước thực hiện thủ công, có mô tả chi tiết và thời gian dự kiến.</p>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { handleFormChange('type', 'AUTOMATION'); setModalView('form'); }} // <-- SỬA LỖI: Cần 'setModalView'
                                        className="text-left p-4 border border-gray-300 rounded-lg hover:bg-sky-50 hover:border-sky-500 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    >
                                        <h4 className="font-bold text-gray-800">Tự động hóa (Automation)</h4>
                                        <p className="text-sm text-gray-600 mt-1">Tạo kịch bản với các bước thực thi câu lệnh tự động trên các máy chủ đã được định nghĩa.</p>
                                    </button>
                                </div>
                                <div className="flex justify-end mt-6 border-t border-gray-200 pt-4">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">Hủy</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex-shrink-0 flex items-center">
                                    { !editingScenario && 
                                        <button type="button" onClick={() => setModalView('selectType')} className="mr-3 p-1 rounded-full hover:bg-gray-200" title="Quay lại"> {/* <-- SỬA LỖI: Cần 'setModalView' */}
                                            <ArrowLeftIcon />
                                        </button>
                                    }
                                    {editingScenario ? t('editScenario') : (formData.type === 'MANUAL' ? "Tạo kịch bản Thủ công" : "Tạo kịch bản Tự động hóa")}
                                </h3>
                                <form onSubmit={handleSave} className="flex-1 overflow-y-auto pr-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">{t('scenarioName')}</label>
                                            <input type="text" value={formData.name} onChange={(e) => handleFormChange('name', e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" required/>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">{t('applicationName')}</label>
                                            <input type="text" value={formData.applicationName} onChange={(e) => handleFormChange('applicationName', e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" required/>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">{t('role')}</label>
                                            {user.role === 'ADMIN' ? (
                                                <select value={formData.role} onChange={(e) => handleFormChange('role', e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                                                    <option value="TECHNICAL">TECHNICAL</option>
                                                    <option value="BUSINESS">BUSINESS</option>
                                                </select>
                                            ) : (
                                                <input type="text" value={formData.role} className="mt-1 block w-full bg-gray-200 border border-gray-300 rounded-md p-2 text-gray-500" readOnly/>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-gray-700">{t('basisForConstruction')}</label>
                                        <textarea value={formData.basis} onChange={(e) => handleFormChange('basis', e.target.value)} rows="2" className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" />
                                    </div>
                                    
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-gray-700">{t('attachPDF', 'Đính kèm PDF cho kịch bản')}</label>
                                        {scenarioAttachment && scenarioAttachment.name ? (
                                            <div className="mt-1 flex items-center justify-between bg-gray-200 p-2 rounded-md">
                                                <div className="flex items-center min-w-0">
                                                    <PaperClipIcon />
                                                    <span className="text-sm text-gray-800 truncate ml-2">{scenarioAttachment.name}</span>
                                                </div>
                                                <button type="button" onClick={handleRemoveAttachment} className="text-red-500 hover:text-red-700 font-bold ml-2 text-xl flex-shrink-0">&times;</button>
                                            </div>
                                        ) : (
                                            <input type="file" accept=".pdf" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer" />
                                        )}
                                    </div>

                                    {user.role === 'ADMIN' && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-medium text-gray-700">{t('scenarioStatus')}</label>
                                            <select value={formData.status} onChange={(e) => handleFormChange('status', e.target.value)} disabled={!formData.basis} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none disabled:opacity-50">
                                                <option value="Draft">{t('draft')}</option>
                                                <option value="Active">{t('active')}</option>
                                            </select>
                                            {!formData.basis && <p className="text-xs text-yellow-600 mt-1">{t('basisRequiredMessage')}</p>}
                                        </div>
                                    )}

                                    <h4 className="font-bold text-gray-900 mt-6 mb-2">{t('steps')}</h4>
                                    
                                    {/* --- START: THÊM TRẠNG THÁI LOADING CHO CÁC BƯỚC --- */}
                                    { loadingModalSteps ? (
                                        <div className="text-center p-6 text-gray-600">
                                            Đang tải chi tiết các bước...
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                {stepInputs.map((step, index) => (
                                                    <div key={step.id || index} className={`border border-gray-200 rounded-md bg-gray-50 transition-all duration-300 ${draggedStepIndex === index ? 'opacity-50' : ''}`} draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, index)}>
                                                        <div className="p-2 flex items-center space-x-2">
                                                            <div className="cursor-move text-gray-400 wiggle-on-drag"><DragHandleIcon /></div>
                                                            <div className="flex-1 cursor-pointer" onClick={() => handleToggleExpandStep(index)}>
                                                                <div className="flex justify-between items-center">
                                                                    <h4 className="font-bold text-gray-800">{t('step')} {index + 1}: {step.title || t('noTitle')}</h4>
                                                                    <div className="flex items-center space-x-4">
                                                                    {stepInputs.length > 1 && (<button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveStep(index); }} className="text-red-500 hover:text-red-700 font-bold text-xl">&times;</button>)}
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${expandedStepIndex === index ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {expandedStepIndex === index && (
                                                            <div className="p-4 border-t border-gray-200 space-y-4">
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-600">{t('stepName')} <span className="text-red-500">{t('requiredField')}</span></label>

        <input type="text" placeholder={t('stepTitlePlaceholder')} value={step.title || ''} onChange={e => handleStepChange(index, 'title', e.target.value)} className="mt-1 block w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" required />
                                                                </div>
                                                                
                                                                {formData.type === 'MANUAL' && (
                                                                    <>
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-gray-600">{t('estimatedTime')}</label>
                                                                            <input type="text" placeholder="hh:mm:ss" value={step.estimated_time || ''} onChange={e => handleStepChange(index, 'estimated_time', e.target.value)} className="mt-1 block w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-gray-600">{t('stepDescription')} <span className="text-red-500">{t('requiredField')}</span></label>
                                                                            <RichTextEditor value={step.description || ''} onChange={value => handleStepChange(index, 'description', value)} />
                                                                        </div>
                                                                    </>
                                                                )}

                                                                {formData.type === 'AUTOMATION' && (
                                                                    <>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                            {/* --- START: SỬ DỤNG SERVER SELECTOR (FIX 2) --- */}
                                                                            <ServerSelector
                                                                                servers={servers} // <-- SỬA LỖI: Cần 'servers'
                                                                                serverId={step.server_id}
                                                                                onChange={(serverId) => handleStepChange(index, 'server_id', serverId)}
                                                                            />
                                                                            {/* --- END: SỬ DỤNG SERVER SELECTOR --- */}
                                                                            
                                                                            <div>
                                                                                <label className="block text-xs font-medium text-gray-600">Người dùng thực thi</label>
                                                                                <input type="text" placeholder="e.g., root, admin" value={step.server_user || ''} onChange={e => handleStepChange(index, 'server_user', e.target.value)} className="mt-1 block w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" />
                                                                            </div>
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-gray-600">Câu lệnh <span className="text-red-500">*</span></label>
                                                                            <textarea placeholder="e.g., systemctl restart nginx" value={step.command || ''} onChange={e => handleStepChange(index, 'command', e.target.value)} rows="4" className="mt-1 block w-full bg-white border border-gray-300 rounded-md p-2 font-mono text-sm text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" required />
                                                                        </div>
                                                                    </>
                                                                )}
                                                                
                                                                <DependencySelector 
                                                                    item={step}
                                                                    itemList={stepInputs}
                                                                    currentIndex={index}
                                                                    onDependencyChange={(deps) => handleStepChange(index, 'dependsOn', deps)}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <button type="button" onClick={handleAddStep} className="mt-4 text-[#00558F] hover:underline text-sm font-semibold">{t('addStep')}</button>
                                        </>
                                    )}
                                    {/* --- END: TRẠNG THÁI LOADING --- */}
                                    
                                    <div className="flex justify-end space-x-2 mt-6 border-t border-gray-200 pt-4 flex-shrink-0">
                                        <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">{t('cancel')}</button>
                                        <button type="submit" className="bg-[#00558F] hover:bg-[#004472] text-white font-semibold py-2 px-4 rounded-lg">{editingScenario ? t('saveChanges') : t('saveScenario')}</button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}

            {confirmModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">{t('confirm')}</h3>
                        <p className="text-gray-600 mb-6">{confirmModal.message}</p>
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setConfirmModal({ isOpen: false, message: '', onConfirm: null })} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">{t('cancel')}</button>
                            <button onClick={confirmModal.onConfirm} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg">{t('confirm')}</button> 
                        </div>
                    </div>
                </div>
            )}

            {/* --- START: MODAL CHẠY THỬ MỚI --- */}
            {isTestRunModalOpen && ( 
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex-shrink-0">
                            Chạy thử kịch bản: <span className="text-sky-600 ml-2">{testRunScenario?.name}</span>
                        </h3>
                        
                        <div className="mb-4 flex-shrink-0">
                            <label className="font-semibold">Trạng thái:</label>
                            {/* Cập nhật logic hiển thị trạng thái */}
                            <span className={`ml-2 px-2 py-1 rounded-full text-sm ${
                                (testRunStatus === 'running') ? 'bg-blue-100 text-blue-800' : 
                                (testRunStatus === 'api_pending' || testRunStatus === 'ws_connecting') ? 'bg-yellow-100 text-yellow-800' :
                                (testRunStatus === 'finished') ? 'bg-green-100 text-green-800' :
                                (testRunStatus === 'failed') ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                            }`}>
                                {
                                    (testRunStatus === 'api_pending') ? 'Đang yêu cầu...' :
                                    (testRunStatus === 'ws_connecting') ? 'Đang kết nối...' :
                                    (testRunStatus === 'running') ? 'Đang chạy...' :
                                    (testRunStatus === 'finished') ? 'Hoàn thành' :
                                    (testRunStatus === 'failed') ? 'Thất bại' :
                                    'Chờ'
                                }
                            </span>
                            {testRunStatus === 'failed' && testRunError && ( 
                                <p className="text-red-600 text-sm mt-2">{testRunError}</p> 
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto bg-gray-900 text-white text-xs rounded-md font-mono p-4" ref={logContainerRef}>
                            <pre className="whitespace-pre-wrap break-words">
                                {testRunLogs.map((log, index) => ( 
                                    <div key={index}>{log}</div>
                                ))}\
                            </pre>
                        </div>
                        
                        <div className="flex justify-end space-x-2 mt-6 border-t border-gray-200 pt-4 flex-shrink-0">
                            {/* Cập nhật logic nút Hủy/Đóng */}
                            <button 
                                type="button" 
                                onClick={handleCloseTestRunModal} 
                                className={`py-2 px-4 rounded-lg font-semibold transition-colors ${
                                    (testRunStatus === 'api_pending' || testRunStatus === 'ws_connecting' || testRunStatus === 'running') 
                                    ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                }`}
                            >
                                {(testRunStatus === 'api_pending' || testRunStatus === 'ws_connecting' || testRunStatus === 'running') ? 'Ngắt phiên' : 'Đóng'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* --- END: MODAL CHẠY THỬ MỚI --- */}
        </>
    );
};
export default ScenarioManagementScreen;