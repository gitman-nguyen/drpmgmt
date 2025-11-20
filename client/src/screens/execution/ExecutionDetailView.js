import React, { useState } from 'react';
import {
    useTranslation,
    LockIcon,
    ExternalLinkIcon,
    PlayIcon,
    RefreshCwIcon,
    StepSpinner,
    ClockIcon,
    UserIcon,
    CheckCircleIcon,
    XCircleIcon,
    CheckpointIcon,
    viewPdfInNewWindow
} from './ExecutionMocksAndUtils.js';
import {
    ScenarioWorkflowView
} from './ExecutionScenarioViews.js';

// --- File này chứa component DetailView (logic hiển thị chính) ---

export const DetailView = ({ node, user, drill, steps, users, getStepState, handleStepStart, setCompletionModal, onConfirmScenario, drillExecData, scenarios, userColorMap, onEvaluateCriterion, onEndDrillFailed, autoRunState, onStepSelect, selectedStepId, liveLogs, canControlExecution, hasExecutedSteps, isAutoRunning, rerunModalOpen, onStartAutoRun, onRerunClick }) => {
    const { t } = useTranslation();
    const [finalStatus, setFinalStatus] = useState('Failure-Confirmed');
    const [finalReason, setFinalReason] = useState('');

    if (!node) return null;

    const handleConfirm = () => {
        if (finalReason) {
            onConfirmScenario(node.id, finalStatus, finalReason);
        } else {
            console.error('Vui lòng nhập lý do xác nhận.');
        }
    };

    if (node.nodeType === 'scenario') {
        const scenario = node;
        const allStepsDone = scenario.steps.every(s => getStepState(s).status?.startsWith('Completed'));
        const hasFailedStep = scenario.steps.some(s => getStepState(s).status === 'Completed-Failure' || s.status === 'Completed-Blocked');
        
        const isConfirmed = !!getStepState(scenario.id)?.final_status;
        const isAutomaticMode = scenario.type === 'AUTOMATION';

        if (scenario.isLocked) {
             return (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <LockIcon className="w-16 h-16 text-gray-400" />
                    <h3 className="text-xl font-bold text-gray-900 mt-4">{t('scenarioLocked')}</h3>
                    <p className="text-gray-500">{t('scenarioLockedMessage', 'Vui lòng hoàn thành các kịch bản hoặc checkpoint phụ thuộc trước.')}</p>
                </div>
            )
        }

        const hasAttachment = scenario.attachment && scenario.attachment.data;

        if (isAutomaticMode) {
            return (
                <div>
                    <div className="flex items-center gap-4 flex-wrap justify-end mb-4">
                        {canControlExecution && hasExecutedSteps && (
                             <button
                                onClick={onRerunClick} 
                                disabled={isAutoRunning}
                                className="inline-flex items-center gap-2 px-6 py-2 bg-yellow-500 text-white font-bold rounded-lg shadow-md hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all"
                            >
                                <RefreshCwIcon className="w-5 h-5" />
                                {t('rerunScenario', 'Chạy lại')}
                            </button>
                        )}

                        {canControlExecution && (
                            <button
                                onClick={onStartAutoRun} 
                                disabled={isAutoRunning}
                                className={`inline-flex items-center gap-2 px-6 py-2 text-white font-bold rounded-lg shadow-md transition-all ${
                                     isAutoRunning || (hasExecutedSteps && !rerunModalOpen)
                                     ? 'bg-gray-400 cursor-not-allowed'
                                     : 'bg-green-600 hover:bg-green-700'
                                 }`}
                            >
                                {isAutoRunning ? <StepSpinner /> : <PlayIcon className="w-5 h-5" />}
                                {isAutoRunning ? t('running') : (hasExecutedSteps ? t('executed', 'Đã chạy') : t('startAutoExecution', 'Bắt đầu chạy tự động'))}
                            </button>
                        )}
                    </div>

                    <ScenarioWorkflowView
                        scenario={scenario}
                        steps={steps}
                        getStepState={getStepState}
                        autoRunState={autoRunState}
                        t={t}
                        onStepSelect={onStepSelect}
                        selectedStepId={selectedStepId}
                    />
                </div>
            );
        }

        // Manual mode scenario view
        return (
            <div>
                 <h2 className="text-2xl font-bold text-gray-900 mb-4">{scenario.name}</h2>
                 <div className={`grid grid-cols-1 ${hasAttachment ? 'xl:grid-cols-2 gap-6' : ''}`}>
                    {hasAttachment && (
                        <div className="bg-gray-100 p-4 rounded-lg flex flex-col h-[75vh]">
                             <div className="flex justify-between items-center mb-2 flex-shrink-0">
                                <h3 className="font-bold text-gray-800">Tài liệu đính kèm</h3>
                                <button
                                    onClick={() => viewPdfInNewWindow(scenario.attachment.data, scenario.attachment.name)}
                                    disabled={!scenario.attachment.data}
                                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                                >
                                    <ExternalLinkIcon className="w-4 h-4" />
                                    <span className="ml-2">{t('viewLarger', 'Xem lớn hơn')}</span>
                                </button>
                            </div>
                            <div className="flex-grow border border-gray-300 rounded flex items-center justify-center bg-white">
                                <iframe
                                    src={scenario.attachment.data}
                                    width="100%"
                                    height="100%"
                                    title={scenario.attachment.name || "PDF Viewer"}
                                    className="border-0"
                                ></iframe>
                            </div>
                        </div>
                    )}

                    <div>
                         <div className="space-y-3">
                            {scenario.steps.map(stepId => {
                                const step = steps[stepId];
                                if (!step) return null;
                                const state = getStepState(stepId);

                                let statusIcon = <ClockIcon className="w-5 h-5 text-gray-500" />;
                                let borderColor = 'border-gray-300';

                                if (state.status === 'InProgress') {
                                    statusIcon = <PlayIcon className="w-5 h-5 text-blue-600" />;
                                    borderColor = 'border-blue-500';
                                } else if (state.status === 'Completed-Success') {
                                    statusIcon = <CheckCircleIcon className="w-5 h-5 text-green-600" />;
                                    borderColor = 'border-green-500';
                                } else if (state.status === 'Completed-Failure' || state.status === 'Completed-Blocked') {
                                    statusIcon = <XCircleIcon className="w-5 h-5 text-red-600" />;
                                    borderColor = 'border-red-500';
                                } else if (state.status === 'Completed-Skipped') {
                                    statusIcon = <CheckCircleIcon className="w-5 h-5 text-yellow-600" />;
                                    borderColor = 'border-yellow-500';
                                }

                                const assigneeId = state.assignee || drill.step_assignments?.[stepId];
                                const assignee = assigneeId ? users.find(u => u.id === assigneeId) : null;
                                const assigneeLabel = state.assignee ? t('executedBy') : t('assignedTo');
                                const colorStyle = assignee ? userColorMap[assignee.id] : null;

                                const isAuthorizedToExecute = user.role === 'ADMIN' || user.role === scenario.role;

                                return (
                                    <div key={stepId} className={`p-4 rounded-lg border-l-4 bg-gray-50 ${borderColor} transition-all`}>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <span className="flex-shrink-0">{statusIcon}</span>
                                                    <h4 className="font-bold text-lg text-gray-900">{step.title}</h4>
                                                    {step.estimated_time && <span className="text-sm text-gray-500 ml-4 flex items-center"><ClockIcon className="w-4 h-4 mr-1" />{step.estimated_time}</span>}
                                                </div>
                                                <div className="prose prose-sm mt-2 max-w-none text-gray-600" dangerouslySetInnerHTML={{ __html: step.description }} />

                                                {assignee && colorStyle && (
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <UserIcon className="h-4 w-4 text-gray-500" />
                                                        <span className="text-xs font-medium text-gray-600">{assigneeLabel}:</span>
                                                        <span className={`text-xs px-2 py-0-5 rounded-full font-semibold ${colorStyle.bg} ${colorStyle.text}`}>
                                                            {assignee.last_name && assignee.first_name ? `${assignee.last_name} ${assignee.first_name}` : (assignee.fullname || assignee.username)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right flex-shrink-0 ml-4">
                                                {isAuthorizedToExecute && (
                                                    <>
                                                        {state.status === 'Pending' && <button onClick={() => handleStepStart(stepId)} className="bg-blue-500 text-white text-sm font-semibold py-1 px-3 rounded-lg hover:bg-blue-600">{t('start')}</button>}
                                                        {state.status === 'InProgress' && <button onClick={() => setCompletionModal({ stepId })} className="bg-green-500 text-white text-sm font-semibold py-1 px-3 rounded-lg hover:bg-green-600">{t('complete')}</button>}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                         {user.role === 'ADMIN' && !isAutomaticMode && allStepsDone && hasFailedStep && !isConfirmed && (
                            <div className="mt-6 border-t border-gray-200 pt-4">
                                <h3 className="text-lg font-bold text-red-600">{t('confirmScenarioResult')}</h3>
                                <p className="text-sm text-gray-600 mb-2">{t('confirmScenarioResultMessage')}</p>
                                 <div className="mb-2">
                                    <label className="block text-sm font-medium text-gray-700">{t('finalResult')}</label>
                                    <select value={finalStatus} onChange={(e) => setFinalStatus(e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                                        <option value="Failure-Confirmed">{t('failureConfirmed')}</option>
                                        <option value="Success-Overridden">{t('successOverridden')}</option>
                                    </select>
                                </div>
                                <textarea value={finalReason} onChange={(e) => setFinalReason(e.target.value)} rows="3" className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" placeholder={t('reasonPlaceholder')}></textarea>
                                <button onClick={handleConfirm} className="mt-2 bg-yellow-400 text-black font-bold py-2 px-4 rounded-lg hover:bg-yellow-500">{t('confirmResult')}</button>
                            </div>
                        )}
                    </div>
                 </div>
            </div>
        );
    }

    if (node.nodeType === 'checkpoint') {
        const checkpoint = node;
        const allCriteriaChecked = checkpoint.criteria.every(c => drillExecData[c.id]?.status);
        const hasFailedCriterion = checkpoint.criteria.some(c => drillExecData[c.id]?.status === 'Fail');

        if (checkpoint.isLocked) {
             return (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <LockIcon className="w-16 h-16 text-gray-400" />
                    <h3 className="text-xl font-bold text-gray-900 mt-4">{t('checkpointLocked')}</h3>
                     <p className="text-gray-500">{t('checkpointLockedMessage', 'Vui lòng hoàn thành kịch bản phụ thuộc trước khi đánh giá checkpoint này.')}</p>
                </div>
            )
        }

        return (
            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3"><CheckpointIcon className="w-8 h-8 text-yellow-500" /> {checkpoint.title}</h2>
                <p className="text-gray-600 mb-4">{t('evaluateCheckpointMessage')}</p>
                <div className="space-y-3">
                    {checkpoint.criteria.map(criterion => {
                        const state = drillExecData[criterion.id];
                        const checkedByUser = state?.checked_by ? users.find(u => u.id === state.checked_by) : null;
                        return(
                            <div key={criterion.id} className="bg-gray-50 p-4 rounded-lg">
                                <p className="text-gray-800">{criterion.criterion_text}</p>
                                {user.role === 'ADMIN' && !state?.status && (
                                     <div className="mt-3 flex gap-3">
                                        <button onClick={() => onEvaluateCriterion(criterion.id, 'Pass')} className="flex items-center gap-2 bg-green-100 text-green-800 font-semibold px-4 py-2 rounded-lg hover:bg-green-200"><CheckCircleIcon className="w-5 h-5" /> {t('pass')}</button>
                                        <button onClick={() => onEvaluateCriterion(criterion.id, 'Fail')} className="flex items-center gap-2 bg-red-100 text-red-800 font-semibold px-4 py-2 rounded-lg hover:bg-red-200"><XCircleIcon className="w-5 h-5" /> {t('fail')}</button>
                                     </div>
                                )}
                                {state?.status && (
                                    <div className="mt-3 flex items-center gap-3 text-sm">
                                        <span className={`font-bold ${state.status === 'Pass' ? 'text-green-600' : 'text-red-600'}`}>{state.status === 'Pass' ? `✓ ${t('passed')}`: `✗ ${t('failed')}`}</span>
                                        <span className="text-gray-500">({t('checkedBy')}: {checkedByUser?.fullname || 'N/A'})</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {user.role === 'ADMIN' && allCriteriaChecked && hasFailedCriterion && (
                     <div className="mt-6 border-t pt-4 text-center bg-red-50 p-4 rounded-lg">
                        <h3 className="font-bold text-red-700">{t('checkpointFailedTitle')}</h3>
                        <p className="text-red-600 text-sm mb-3">{t('checkpointFailedMessage')}</p>
                        <button onClick={() => onEndDrillFailed(checkpoint)} className="bg-red-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-red-700">{t('endDrill')}</button>
                    </div>
                )}
            </div>
        );
    }

    return null;
}
