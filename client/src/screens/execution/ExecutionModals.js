import React, { useState, useMemo } from 'react';
import {
    useTranslation,
    AlertTriangleIcon,
} from './ExecutionMocksAndUtils.js';

// --- File này chứa tất cả các component Modal ---

// 1. CompletionModal (tách ra từ inlined dependency)
export const CompletionModal = ({ step, onComplete, onClose }) => {
    const [reason, setReason] = useState('');
    const { t } = useTranslation();
    if (!step) return null;

    return (
        <div className="p-6 bg-white rounded-xl shadow-2xl max-w-lg w-full z-50">
            <h3 className="text-xl font-bold mb-4">{t('completeStep', 'Hoàn thành bước')}: {step.title}</h3>
            <p className="text-sm text-gray-600 mb-4">{t('completeStepMessage', 'Vui lòng cung cấp kết quả thực thi cho bước thủ công này.')}</p>
            <textarea
                className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                rows="4"
                placeholder={t('reasonPlaceholder', 'Nhập lý do, ghi chú hoặc kết quả...')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-3">
                <button
                    onClick={onClose}
                    className="px-5 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                >
                    {t('cancel', 'Hủy')}
                </button>
                <button
                    onClick={() => onComplete({ status: 'Completed-Failure', text: reason })}
                    className="px-5 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
                >
                    {t('fail', 'Thất bại')}
                </button>
                 <button
                    onClick={() => onComplete({ status: 'Completed-Success', text: reason })}
                    className="px-5 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
                >
                    {t('pass', 'Thành công')}
                </button>
            </div>
        </div>
    );
};


// 2. FailureActionModal
export const FailureActionModal = ({ t, stepTitle, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
                <div className="flex items-center gap-4">
                    <div className="bg-red-100 p-3 rounded-full">
                        <AlertTriangleIcon className="w-8 h-8 text-red-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{t('executionPaused', 'Thực thi đã tạm dừng')}</h2>
                        <p className="text-gray-600 mt-1">{t('stepFailed', { stepName: stepTitle || '...' })}</p>
                    </div>
                </div>
                <p className="mt-4 text-sm text-gray-500">{t('failureActionPrompt', 'Vui lòng kiểm tra log để biết chi tiết. Bạn có thể chạy lại kịch bản sau khi khắc phục sự cố.')}</p>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600">{t('close', 'Đóng')}</button>
                </div>
            </div>
        </div>
    );
};

// 3. RerunModal
export const RerunModal = ({ t, scenario, steps, getStepState, onClose, onRerun }) => {
    const allStepsInScenario = useMemo(() => (scenario?.steps || []).map(id => steps[id]).filter(Boolean), [scenario, steps]);

    const runnableSteps = useMemo(() =>
        allStepsInScenario.filter(step => {
            const status = getStepState(step.id).status;
            return status !== 'Completed-Success' && status !== 'InProgress' && status !== 'Completed-Skipped';
        }).map(s => s.id),
    [allStepsInScenario, getStepState]);

    const [selectedSteps, setSelectedSteps] = useState(runnableSteps);

    const handleToggleStep = (stepId) => {
        setSelectedSteps(prev =>
            prev.includes(stepId) ? prev.filter(id => id !== stepId) : [...prev, stepId]
        );
    };

    const handleRerunSelected = () => {
        if (selectedSteps.length > 0) {
            onRerun(selectedSteps);
            onClose();
        } else {
            console.error('Vui lòng chọn ít nhất một bước để chạy lại.');
        }
    };

    const handleRerunAllFailed = () => {
        if(runnableSteps.length > 0) {
            onRerun(runnableSteps);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('rerunScenario', 'Chạy lại kịch bản')}: <span className="text-sky-600">{scenario?.name}</span></h2>
                <p className="text-sm text-gray-600 mb-4">{t('rerunModalDescription', 'Chọn các bước bạn muốn thực thi lại. Chỉ các bước chưa thành công hoặc chưa chạy mới có thể được chọn.')}</p>

                <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                    {allStepsInScenario.map(step => {
                        const state = getStepState(step.id);
                        const isRunnable = runnableSteps.includes(step.id);
                        const isChecked = selectedSteps.includes(step.id);
                        
                        let statusText = state.status || 'Pending';
                        if (state.status === 'Completed-Skipped') {
                            statusText = 'Đã bỏ qua (Skipped)';
                        }

                        return (
                            <div key={step.id} className={`p-3 rounded-lg flex items-center gap-4 border ${isRunnable ? 'cursor-pointer' : 'opacity-60 bg-gray-100'}`} onClick={() => isRunnable && handleToggleStep(step.id)}>
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={!isRunnable}
                                    onChange={() => {}}
                                    className="h-5 w-5 rounded text-sky-600 focus:ring-sky-500 border-gray-300 disabled:cursor-not-allowed"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-800">{step.title}</p>
                                    <p className="text-xs text-gray-500">Trạng thái hiện tại: {statusText}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300">{t('cancel', 'Hủy')}</button>
                    <button onClick={handleRerunAllFailed} disabled={runnableSteps.length === 0} className="px-4 py-2 bg-yellow-400 text-yellow-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed">{t('rerunAllFailed', 'Chạy lại tất cả bước lỗi')}</button>
                    <button onClick={handleRerunSelected} disabled={selectedSteps.length === 0} className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">{t('rerunSelected', 'Chạy lại mục đã chọn')}</button>
                </div>
            </div>
        </div>
    );
};
