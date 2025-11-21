import React, { useMemo, useEffect, useRef } from 'react';
import {
    useTranslation,
    CheckpointIcon,
    RefreshCwIcon,
    StepSpinner,
    ClockIcon,
    CheckCircleIcon,
    XCircleIcon,
    formatDateTime
} from './ExecutionMocksAndUtils.js';

// --- File này chứa các component con để HIỂN THỊ quy trình ---

export const WorkflowConnector = () => (
    <div className="mx-4 self-center text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
    </div>
);

export const ScenarioSubLevelConnector = () => (
    <div className="mx-2 self-center text-sky-500/70">
        <svg width="24" height="24" viewBox="0 0 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
            <path d="M11 17L16 12L11 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 17L12 12L7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 17L8 12L3 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    </div>
);


export const CheckpointMilestone = ({ checkpoint, onClick, activeNodeId }) => {
    const isThisCheckpointSelected = activeNodeId === checkpoint.id;
    const isCompleted = checkpoint.executionStatus === 'Completed';
    const isPassed = isCompleted && checkpoint.isPassed;
    const isFailed = isCompleted && !isPassed;

    let lineColor = 'bg-gray-300';
    if (isPassed) lineColor = 'bg-green-400';
    if (isFailed) lineColor = 'bg-red-400';

    let iconColor = 'text-yellow-600';
    if (isPassed) iconColor = 'text-green-600';
    if (isFailed) iconColor = 'text-red-600';
    if (checkpoint.isLocked) iconColor = 'text-gray-400';

    return (
        <div className="h-full flex flex-col items-center justify-center relative w-16">
            <div className={`w-1 h-full absolute top-0 left-1/2 -translate-x-1/2 ${lineColor}`}></div>
            <button
                onClick={onClick}
                disabled={checkpoint.isLocked}
                className={`relative z-10 p-2 rounded-full transition-all duration-200 shadow-md
                    ${isThisCheckpointSelected ? 'ring-4 ring-sky-500 bg-white' : 'bg-white hover:bg-yellow-100'}
                    ${checkpoint.isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}
                    ${isFailed ? 'animate-pulse ring-2 ring-red-500' : ''}
                `}
                title={checkpoint.title}
            >
                <CheckpointIcon className={`w-8 h-8 ${iconColor}`} />
            </button>
        </div>
    );
};

export const RefreshControls = ({ refreshInterval, setRefreshInterval, onRefresh, isLoading, t }) => {
    const refreshIntervals = [
        { value: 0, label: t('refreshOff', 'Tắt') },
        { value: 5000, label: '5s' },
        { value: 60000, label: t('oneMinute', '1 phút') },
        { value: 120000, label: t('twoMinutes', '2 phút') },
        { value: 300000, label: t('fiveMinutes', '5 phút') },
    ];

    return (
        <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-2">
                <label htmlFor="refresh-interval" className="text-sm text-gray-600 whitespace-nowrap">{t('autoRefresh', 'Tự động làm mới')}:</label>
                <select
                    id="refresh-interval"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="bg-white border border-gray-300 rounded-md py-1 px-2 text-gray-900 text-sm focus:ring-sky-500 focus:border-sky-500"
                >
                    {refreshIntervals.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
            <button
                onClick={onRefresh}
                className="p-3 rounded-lg transition-all bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                disabled={isLoading}
                aria-label={t('refresh', 'Làm mới')}
            >
                <RefreshCwIcon className={`w-5 h-5 text-gray-700 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
        </div>
    );
};

// --- SỬA ĐỔI: Thêm props drill, userAvatarLabels, userColorMap ---
export const ScenarioWorkflowView = ({ 
    scenario, 
    steps, 
    getStepState, 
    autoRunState, 
    t, 
    onStepSelect, 
    selectedStepId,
    drill,              // Prop mới: Thông tin drill (chứa assignments)
    userAvatarLabels,   // Prop mới: Map tên hiển thị (Hoan, Anh...)
    userColorMap        // Prop mới: Map màu avatar
}) => {
    const stepLevels = useMemo(() => {
        if (!scenario || !scenario.steps || !steps) return [];
        const scenarioSteps = scenario.steps.map(id => steps[id]).filter(Boolean);
        const stepIdSet = new Set(scenarioSteps.map(s => s.id));
        const adj = {};
        const inDegree = {};

        scenarioSteps.forEach(s => {
            adj[s.id] = [];
            inDegree[s.id] = 0;
        });

        scenarioSteps.forEach(s => {
            const dependencies = steps[s.id]?.dependsOn || [];
            
            dependencies.forEach(depId => {
                if (stepIdSet.has(depId) && adj[depId]) {
                    adj[depId].push(s.id);
                    inDegree[s.id]++;
                }
            });
        });

        const queue = scenarioSteps.filter(s => inDegree[s.id] === 0);
        const levels = [];
        while (queue.length > 0) {
            const currentLevelNodes = queue.splice(0, queue.length);
            levels.push(currentLevelNodes);
            currentLevelNodes.forEach(uNode => {
                (adj[uNode.id] || []).forEach(vId => {
                    inDegree[vId]--;
                    if (inDegree[vId] === 0) {
                        const nextStep = scenarioSteps.find(s => s.id === vId);
                        if (nextStep) queue.push(nextStep);
                    }
                });
            });
        }
         const stepsInLevels = new Set(levels.flat().map(s => s.id));
        const remainingSteps = scenarioSteps.filter(s => !stepsInLevels.has(s.id));
        if (remainingSteps.length > 0) {
            console.warn("Detected possible cycle or disconnected steps in scenario:", scenario.name, remainingSteps);
            levels.push(remainingSteps);
        }

        return levels;
    }, [scenario, steps]);

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{scenario.name}</h2>
            <div className="bg-gray-100 p-4 rounded-lg flex flex-row items-center gap-4 overflow-x-auto min-h-[150px]">
                {stepLevels.map((level, levelIndex) => (
                    <React.Fragment key={levelIndex}>
                        {levelIndex > 0 && <WorkflowConnector />}
                        <div className="flex flex-col items-center gap-3">
                            {level.map(step => {
                                const state = getStepState(step.id);
                                const isRunning = autoRunState.runningSteps.includes(step.id) || state.status === 'InProgress';
                                const isSelected = selectedStepId === step.id;

                                let statusIcon = <ClockIcon className="w-5 h-5 text-gray-400" />;
                                let borderColor = 'border-gray-300';
                                let bgColor = 'bg-white';

                                if (isRunning) {
                                    statusIcon = <StepSpinner />;
                                    borderColor = 'border-blue-500';
                                    bgColor = 'bg-blue-50';
                                } else if (state.status === 'Completed-Success') {
                                    statusIcon = <CheckCircleIcon className="w-5 h-5 text-green-500" />;
                                    borderColor = 'border-green-400';
                                    bgColor = 'bg-green-50';
                                } else if (state.status === 'Completed-Failure' || state.status === 'Completed-Blocked') {
                                    statusIcon = <XCircleIcon className="w-5 h-5 text-red-500" />;
                                    borderColor = 'border-red-400';
                                    bgColor = 'bg-red-50';
                                } else if (state.status === 'Completed-Skipped') {
                                    statusIcon = <CheckCircleIcon className="w-5 h-5 text-yellow-500" />;
                                    borderColor = 'border-yellow-400';
                                    bgColor = 'bg-yellow-50';
                                }

                                // --- AVATAR LOGIC ---
                                const assigneeId = drill?.step_assignments?.[step.id];
                                const hasAssignee = !!assigneeId;
                                const avatarLabel = hasAssignee && userAvatarLabels ? (userAvatarLabels[assigneeId] || '?') : null;
                                const avatarColorClass = hasAssignee && userColorMap ? (userColorMap[assigneeId] || 'bg-gray-400') : 'bg-gray-200';

                                return (
                                    <button
                                        key={step.id}
                                        onClick={() => onStepSelect(step.id)}
                                        className={`p-3 rounded-lg border-l-4 w-64 text-left transition-all duration-300 relative ${borderColor} ${bgColor} ${isRunning ? 'animate-pulse' : ''} ${isSelected ? 'ring-2 ring-sky-500 shadow-lg' : 'shadow-md hover:shadow-lg'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0">{statusIcon}</span>
                                            <h4 className="font-semibold text-sm text-gray-800 flex-1 truncate" title={step.title}>{step.title}</h4>
                                            
                                            {/* --- HIỂN THỊ AVATAR --- */}
                                            {hasAssignee && (
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColorClass}`} title={`Assigned to: ${avatarLabel}`}>
                                                    {avatarLabel}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export const StepDetailView = ({ step, state, liveLog, onClose, t, onOverrideStep, canControlExecution, isRunning }) => {
    const logContainerRef = useRef(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [liveLog, state.result_text]); // Thêm state.result_text vào dependencies

    if (!step || !state) return null;

    const displayLog = liveLog ?? state.result_text ?? '';

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">{t('stepDetails', 'Chi tiết bước')}: <span className="text-sky-600">{step.title}</span></h3>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                    <XCircleIcon className="w-6 h-6 text-gray-500" />
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                    <p className="font-semibold text-gray-700">Thời gian bắt đầu:</p>
                    <p className="text-gray-600 font-mono mt-1">{formatDateTime(state.started_at)}</p>
                </div>
                 <div>
                    <p className="font-semibold text-gray-700">Thời gian kết thúc:</p>
                    <p className="text-gray-600 font-mono mt-1">{formatDateTime(state.completed_at)}</p>
                </div>
                 <div>
                    <p className="font-semibold text-gray-700">Trạng thái:</p>
                    <p className="text-gray-600 mt-1">{state.status || 'N/A'}</p>
                </div>
            </div>

            {canControlExecution && (state.status === 'Completed-Failure' || state.status === 'Pending') && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="font-semibold text-gray-700 text-sm mb-2">{t('adminActions', 'Hành động của Quản trị viên')}:</p>
                    <p className="text-xs text-gray-500 mb-3">{t('adminActionsDesc', 'Ghi đè trạng thái của bước này. Hành động này sẽ bỏ qua thực thi lệnh và kích hoạt các bước phụ thuộc (nếu thành công/bỏ qua).')}</p>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={() => onOverrideStep(step.id, 'Completed-Success')}
                            className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600 transition-all"
                        >
                            {t('markCompleted', 'Mark as Completed (Success)')}
                        </button>
                    </div>
                </div>
            )}

            {(state.status !== 'Pending' || isRunning) && (
                <div className="mt-4">
                    <p className="font-semibold text-gray-700 text-sm">Kết quả (Log):</p>
                    <div ref={logContainerRef} className="mt-1 p-3 bg-gray-900 text-white text-xs rounded-md font-mono max-h-80 overflow-y-auto">
                        <pre className="whitespace-pre-wrap break-words"><code>
                            {/* Ưu tiên hiển thị log nếu có, nếu không mới hiện text mặc định */}
                            {displayLog 
                                ? displayLog 
                                : (isRunning 
                                    ? (state.status === 'InProgress' ? 'Đang chạy...' : 'Đang chờ log...') 
                                    : (state.status === 'InProgress' ? 'Đang chạy...' : 'Không có output.'))
                            }
                        </code></pre>
                    </div>
                </div>
            )}
        </div>
    );
};