import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

const AdminScreen = ({ onDataRefresh }) => {
    const { t } = useTranslation();
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [cleanupPeriod, setCleanupPeriod] = useState('3');
    const [resetConfirmText, setResetConfirmText] = useState('');

    // State for session timeout setting
    const [sessionTimeout, setSessionTimeout] = useState('30'); // Default to 30
    // THÊM MỚI: State cho timeout mặc định của bước
    const [defaultStepTimeout, setDefaultStepTimeout] = useState('120'); // Default to 120s
    // // THÊM MỚI: State cho môi trường
    const [environment, setEnvironment] = useState('TEST'); // Default to TEST
    const [isSaving, setIsSaving] = useState(false);

    // Fetch current settings when component mounts
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // SỬA LỖI: Thêm /api/config/
                const response = await fetch('/api/config/settings');
                if (response.ok) {
                    const data = await response.json();
                    if (data.sessionTimeout) {
                       setSessionTimeout(data.sessionTimeout.toString());
                    }
                    // THÊM MỚI: Lấy cài đặt môi trường
                    if (data.environment) {
                       setEnvironment(data.environment);
                    }
                    // THÊM MỚI: Lấy cài đặt timeout
                    if (data.defaultStepTimeout) {
                       setDefaultStepTimeout(data.defaultStepTimeout.toString());
                    }
                }
            } catch (error) {
                console.error("Failed to fetch settings:", error);
                // Keep default value on error
            }
        };
        fetchSettings();
    }, []);

    const handleSaveSettings = async () => {
        setIsSaving(true);
        try {
            const timeoutValue = parseInt(sessionTimeout, 10);
            if (isNaN(timeoutValue) || timeoutValue <= 0) {
                alert('Vui lòng nhập một số phút hợp lệ.');
                return;
            }
            // THÊM MỚI: Validate defaultStepTimeout
            const timeoutStepValue = parseInt(defaultStepTimeout, 10);
            if (isNaN(timeoutStepValue) || timeoutStepValue < 10) {
                alert('Vui lòng nhập timeout mặc định cho bước hợp lệ (tối thiểu 10 giây).');
                return;
            }
            // SỬA LỖI: Thêm /api/config/
            const response = await fetch('/api/config/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // SỬA ĐỔI: Gửi cả sessionTimeout và environment
                body: JSON.stringify({ 
                    sessionTimeout: timeoutValue,
                    environment: environment,
                    defaultStepTimeout: timeoutStepValue 
                })
            });
            if (!response.ok) throw new Error('Failed to save settings');
            alert('Lưu cài đặt thành công!');
            onDataRefresh(); // Refresh data in App.js to apply new settings
        } catch (error) {
            alert('Lỗi khi lưu cài đặt.');
            console.error("Save settings error:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCleanupHistory = () => {
        const periodTextMap = { '3': t('threeMonths'), '6': t('sixMonths'), '12': t('oneYear') };
        const periodText = periodTextMap[cleanupPeriod];
        
        setConfirmModal({
            isOpen: true,
            message: t('cleanupConfirm', { period: periodText }),
            onConfirm: async () => {
                try {
                    // SỬA LỖI: Thêm /api/config/
                    const response = await fetch('/api/config/admin/cleanup-history', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ months: cleanupPeriod }) 
                    });
                    if (!response.ok) throw new Error('Cleanup failed');
                    const result = await response.json();
                    alert(`Dọn dẹp lịch sử thành công! Đã xóa dữ liệu của ${result.deletedCount || 0} đợt diễn tập.`);
                } catch (error) {
                    alert('Lỗi khi dọn dẹp lịch sử.');
                } finally {
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                }
            }
        });
    };

    const handleResetSystem = () => {
        if (resetConfirmText !== 'RESET') {
            alert('Vui lòng nhập "RESET" để xác nhận.');
            return;
        }
        setConfirmModal({
            isOpen: true,
            message: t('resetConfirmWarning'),
            onConfirm: async () => {
                 try {
                    // SỬA LỖI: Thêm /api/config/
                    const response = await fetch('/api/config/admin/reset-system', { method: 'POST' });
                    if (!response.ok) throw new Error('Reset failed');
                    alert('Reset hệ thống thành công!');
                    onDataRefresh();
                } catch (error) {
                    alert('Lỗi khi reset hệ thống.');
                } finally {
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                    setResetConfirmText('');
                }
            }
        });
    };

    const handleSeedData = () => {
        setConfirmModal({
            isOpen: true,
            message: t('seedConfirm'),
            onConfirm: async () => {
                try {
                    // SỬA LỖI: Thêm /api/config/
                    const response = await fetch('/api/config/admin/seed-demo-data', { method: 'POST' });
                    if (!response.ok) throw new Error('Seed data failed');
                    alert('Tạo dữ liệu demo thành công!');
                    onDataRefresh();
                } catch (error) {
                    alert('Lỗi khi tạo dữ liệu demo.');
                } finally {
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                }
            }
        });
    };

    return (
        <>
            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('adminTools')}</h2>
                <div className="space-y-8">
                    {/* Session Timeout Settings */}
                    {/* SỬA ĐỔI: Đổi tên thành Cài đặt Hệ thống */}
                    <div className="border border-gray-200 p-4 rounded-lg">
                        <h3 className="font-bold text-lg text-gray-800">Cài đặt Hệ thống</h3>
                        <p className="text-sm text-gray-600 mt-1 mb-4">Cấu hình các tham số hoạt động của hệ thống.</p>
                        
                        {/* SỬA ĐỔI: Loại bỏ items-end để căn chỉnh top-down, input thẳng hàng */}
                        <div className="flex flex-wrap gap-x-6 gap-y-4"> {/* LOẠI BỎ items-end và mb-4 */}
                             {/* 1. Thời gian tự động đăng xuất (Chiếm 1/3) */}
                             <div className="flex-1 min-w-[200px]">
                                <label htmlFor="sessionTimeout" className="block text-sm font-medium text-gray-700">Thời gian tự động đăng xuất (phút)</label>
                                <input 
                                    type="number"
                                    id="sessionTimeout"
                                    value={sessionTimeout}
                                    onChange={e => setSessionTimeout(e.target.value)}
                                    className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2"
                                    min="1"
                                />
                            </div>
                            
                            {/* 2. Môi trường hoạt động (Chiếm 1/3) */}
                            <div className="flex-1 min-w-[200px]">
                                <label htmlFor="environment" className="block text-sm font-medium text-gray-700">Môi trường hoạt động</label>
                                <select
                                    id="environment"
                                    value={environment}
                                    onChange={e => setEnvironment(e.target.value)}
                                    className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2"
                                >
                                    <option value="TEST">TEST</option>
                                    <option value="PRODUCTION">PRODUCTION</option>
                                </select>
                            </div>

                            {/* 3. Timeout mặc định bước (Chiếm 1/3) */}
                            <div className="flex-1 min-w-[200px]">
                                <label htmlFor="defaultStepTimeout" className="block text-sm font-medium text-gray-700">Timeout mặc định (giây)</label>
                                <input 
                                    type="number"
                                    id="defaultStepTimeout"
                                    value={defaultStepTimeout}
                                    onChange={e => setDefaultStepTimeout(e.target.value)}
                                    className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2"
                                    min="10"
                                />
                                <p className="text-xs text-gray-500 mt-1">Timeout mặc định cho mỗi bước tự động (Tối thiểu 10s).</p>
                            </div>
                        </div>
                        
                        {/* 4. Nút Lưu - Đặt ngay dưới Flexbox, dùng mt-4 để tạo khoảng cách nhỏ */}
                        <div className="flex justify-start mt-4"> 
                            <button onClick={handleSaveSettings} disabled={isSaving} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                {isSaving ? 'Đang lưu...' : 'Lưu'}
                            </button>
                        </div>
                        
                    </div>

                    {/* Cleanup History */}
                    <div className="border border-gray-200 p-4 rounded-lg">
                        <h3 className="font-bold text-lg text-gray-800">{t('cleanupHistory')}</h3>
                        <p className="text-sm text-gray-600 mt-1 mb-4">{t('cleanupHistoryDesc')}</p>
                        <div className="flex items-center gap-4">
                             <div className="w-1/3">
                                <label className="block text-sm font-medium text-gray-700">{t('deleteDataOlderThan')}</label>
                                <select value={cleanupPeriod} onChange={e => setCleanupPeriod(e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2">
                                    <option value="3">{t('threeMonths')}</option>
                                    <option value="6">{t('sixMonths')}</option>
                                    <option value="12">{t('oneYear')}</option>
                                </select>
                            </div>
                            <button onClick={handleCleanupHistory} className="self-end bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-yellow-600">{t('cleanup')}</button>
                        </div>
                    </div>
                    
                    {/* Seed Demo Data */}
                    <div className="border border-green-300 p-4 rounded-lg bg-green-50">
                        <h3 className="font-bold text-lg text-green-700">{t('seedDemoData')}</h3>
                        <p className="text-sm text-green-600 mt-1 mb-4">{t('seedDemoDataDesc')}</p>
                        <button onClick={handleSeedData} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">{t('seed')}</button>
                    </div>

                    {/* System Reset */}
                    <div className="border border-red-300 p-4 rounded-lg bg-red-50">
                        <h3 className="font-bold text-lg text-red-700">{t('systemReset')}</h3>
                        <p className="text-sm text-red-600 mt-1 mb-4">{t('systemResetDesc')}</p>
                        <div className="w-1/2">
                            <label className="block text-sm font-medium text-gray-700">{t('resetConfirmWarning')}</label>
                            <input 
                                type="text"
                                value={resetConfirmText}
                                onChange={e => setResetConfirmText(e.target.value)}
                                className="mt-1 block w-full bg-white border border-red-300 rounded-md p-2"
                                placeholder="RESET"
                            />
                        </div>
                        <button onClick={handleResetSystem} disabled={resetConfirmText !== 'RESET'} className="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">{t('reset')}</button>
                    </div>
                </div>
            </div>

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
        </>
    );
};

export default AdminScreen;