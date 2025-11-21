import React from 'react';
// Import custom hook chứa logic
import { useExecutionState } from './useExecutionState.js';

// Import các dependencies (mocks, utils, icons)
import {
    useTranslation,
    CheckCircleIcon,
    XCircleIcon,
    LockIcon,
    LinkIcon,
    StepSpinner,
    userColorClasses,
    ClockIcon
} from './ExecutionMocksAndUtils.js';

// Import các component con (Modals, Views)
import { CompletionModal, FailureActionModal, RerunModal } from './ExecutionModals.js';
import {
    RefreshControls,
    CheckpointMilestone,
    WorkflowConnector,
    ScenarioSubLevelConnector,
    StepDetailView
} from './ExecutionScenarioViews.js';
import { DetailView } from './ExecutionDetailView.js';

// --- Tệp ExecutionScreen (chỉ chứa UI) ---
const ExecutionScreen = ({ user, drillId, drillBasicInfo, onBack, onDrillEnded, setActiveScreen, setActiveDrill }) => {
    // Lấy tất cả state và logic từ custom hook
    const {
        t,
        drill,
        steps,
        scenarios,
        allUsers,
        executionData,
        isLoading,
        error,
        activeNodeId,
        setActiveNodeId,
        completionModal,
        setCompletionModal,
        selectedStepId,
        setSelectedStepId,
        isAutoRunning,
        autoRunState,
        failedStepInfo,
        setFailedStepInfo,
        rerunModalOpen,
        setRerunModalOpen,
        liveLogs,
        refreshInterval,
        setRefreshInterval,
        handleRefresh,
        // --- FIX CRITICAL: Thêm giá trị mặc định = {} để tránh lỗi "Cannot read properties of undefined" ---
        userColorMap = {}, 
        userAvatarLabels = {}, 
        // ---------------------------------------------------------------------------------------------
        groupLevels,
        allNodes,
        activeNode,
        getStepState,
        handleEvaluateCriterion,
        handleEndDrillFailed,
        handleScenarioConfirmation,
        handleStepStart,
        handleStepComplete,
        handleStartAutoRun,
        handleRerun,
        handleOverrideStep,
        canControlExecution,
        hasExecutedSteps,
    } = useExecutionState({ user, drillId, drillBasicInfo, onDrillEnded, setActiveScreen, setActiveDrill });

    // --- Guard Clauses (render sớm) ---
    if (isLoading && !drill) {
        return <div className="p-4 text-center text-gray-500">{t('loadingDrill', 'Đang tải dữ liệu diễn tập...')}</div>;
    }
    if (error) {
        return <div className="p-4 text-center text-red-500">{t('errorLoading', 'Lỗi tải dữ liệu:')} {error}</div>;
    }
    if (!drill) {
         return <div className="p-4 text-center text-red-500">{t('errorDrillNotFound', 'Không tìm thấy dữ liệu diễn tập.')}</div>;
    }
    
    const failedStepTitle = failedStepInfo?.stepId ? (steps[failedStepInfo.stepId]?.title || t('unknownStep', 'Bước không xác định')) : null;

    // --- JSX (Phần giao diện) ---
    return (
        <>
            <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <button onClick={onBack} className="text-[#00558F] hover:underline self-start">&larr; {t('backToDashboard')}</button>
                    <RefreshControls
                        refreshInterval={refreshInterval}
                        setRefreshInterval={setRefreshInterval}
                        onRefresh={handleRefresh}
                        isLoading={isLoading || isAutoRunning}
                        t={t}
                    />
                </div>

                {drill && (
                    <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
                        {drill.name}
                    </h1>
                )}

                <div className="bg-white p-4 rounded-xl shadow-lg">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 text-center">{t('scenarios')}</h2>
                    <div className="flex flex-row items-stretch gap-0 overflow-x-auto p-4 bg-gray-100 rounded-lg min-w-full">
                        {groupLevels.map((level, levelIndex) => {
                            const checkpointsMap = new Map();
                            level.forEach(group => { (group.scenarios || []).forEach(s => { if (s.checkpoint) { checkpointsMap.set(s.checkpoint.id, s.checkpoint); }}); });
                            const checkpointsInLevel = Array.from(checkpointsMap.values());
                            return (
                                <React.Fragment key={levelIndex}>
                                    <div className="flex flex-col items-stretch gap-4 py-2">
                                         {level.map(group => {
                                            const scenariosInGroup = group.scenarios;
                                            if (!scenariosInGroup || scenariosInGroup.length === 0) return null;
                                            
                                            const scenarioLevels = (() => {
                                                const scenariosInGroupIdSet = new Set(scenariosInGroup.map(s => s.id));
                                                const adj = {}; const inDegree = {};
                                                scenariosInGroup.forEach(s => { adj[s.id] = []; inDegree[s.id] = 0; });
                                                scenariosInGroup.forEach(s => { (s.dependsOn || []).forEach(depId => { if (scenariosInGroupIdSet.has(depId) && adj[depId]) { adj[depId].push(s.id); inDegree[s.id]++; }}); });
                                                const queue = scenariosInGroup.filter(s => inDegree[s.id] === 0);
                                                const levels = [];
                                                while (queue.length > 0) {
                                                    const currentLevelNodes = queue.splice(0, queue.length);
                                                    levels.push(currentLevelNodes);
                                                    currentLevelNodes.forEach(uNode => { (adj[uNode.id] || []).forEach(vId => { inDegree[vId]--; if (inDegree[vId] === 0) { const nextNode = scenariosInGroup.find(s => s.id === vId); if (nextNode) queue.push(nextNode); }}); });
                                                }
                                                const scenariosInLevels = new Set(levels.flat().map(s => s.id));
                                                const remainingScenarios = scenariosInGroup.filter(s => !scenariosInLevels.has(s.id));
                                                if (remainingScenarios.length > 0) { console.warn("Phát hiện chu trình (cycle) hoặc kịch bản bị ngắt kết nối trong group:", group.name, remainingScenarios); levels.push(remainingScenarios); }
                                                return levels;
                                            })();

                                            return (
                                                <div key={group.id} className="bg-gray-50/50 p-3 rounded-lg border border-gray-200 flex-1 flex flex-col">
                                                    <h3 className="text-md font-bold text-sky-700 mb-1">{group.name}</h3>
                                                    {(drill.group_dependencies?.find(g => g.group === group.id)?.dependsOn || []).length > 0 && (
                                                        <div className="flex items-center gap-1 mb-3 text-xs text-gray-500">
                                                            <LinkIcon className="w-3 h-3" />
                                                            <span>{t('dependsOn', 'Phụ thuộc')}: {drill.group_dependencies.find(g => g.group === group.id).dependsOn.join(', ')}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-row items-center justify-center flex-grow gap-2 mt-2">
                                                        {scenarioLevels.map((scenarioLevel, sLevelIndex) => (
                                                            <React.Fragment key={sLevelIndex}>
                                                                {sLevelIndex > 0 && <ScenarioSubLevelConnector />}
                                                                <div className="flex flex-col items-center gap-3">
                                                                    {scenarioLevel.map(node => {
                                                                        const isSelected = activeNodeId === node.id || activeNodeId === node.checkpoint?.id;
                                                                        const stepIdsInNode = node.steps || [];
                                                                        const isRunning = (node.type === 'AUTOMATION') && stepIdsInNode.some(id => getStepState(id).status === 'InProgress');
                                                                        const isCompleted = node.executionStatus === 'Completed';
                                                                        
                                                                        const stepStates = stepIdsInNode.map(id => getStepState(id).status);
                                                                        const hasFailedStep = stepStates.some(s => s === 'Completed-Failure' || s === 'Completed-Blocked');
                                                                        const hasSkippedStep = stepStates.some(s => s === 'Completed-Skipped');
                                                                        const finalStatus = getStepState(node.id)?.final_status; 

                                                                        const nodeAssignedUserIds = (node.steps || []).map(stepId => drill.step_assignments?.[stepId]).filter(Boolean);
                                                                        const isCurrentUserAssignedToThisNode = nodeAssignedUserIds.includes(user.id);
                                                                        const canViewScenario = user.role === 'ADMIN' || user.role === node.role || isCurrentUserAssignedToThisNode;

                                                                        const stepIdsInThisScenario = Object.values(steps).filter(step => step.scenario_id === node.id).map(step => step.id);
                                                                        const assignedUserIds = new Set(stepIdsInThisScenario.map(stepId => drill.step_assignments?.[stepId]).filter(Boolean));
                                                                        const assignedUsers = Array.from(assignedUserIds).map(userId => allUsers.find(u => u.id === userId)).filter(Boolean);
                                                                        
                                                                        let statusOverlayIcon = null;
                                                                        if (isCompleted) {
                                                                            if (finalStatus === 'Success-Overridden') statusOverlayIcon = <CheckCircleIcon className="w-6 h-6 text-green-500" />;
                                                                            else if (finalStatus === 'Failure-Confirmed') statusOverlayIcon = <XCircleIcon className="w-6 h-6 text-red-500" />;
                                                                            else if (hasFailedStep) statusOverlayIcon = <XCircleIcon className="w-6 h-6 text-red-500" />;
                                                                            else if (hasSkippedStep) statusOverlayIcon = <CheckCircleIcon className="w-6 h-6 text-yellow-500" />;
                                                                            else statusOverlayIcon = <CheckCircleIcon className="w-6 h-6 text-green-500" />;
                                                                        } else if (node.executionStatus === 'Failed') {
                                                                            statusOverlayIcon = <XCircleIcon className="w-6 h-6 text-red-500" />;
                                                                        } else {
                                                                            statusOverlayIcon = <ClockIcon className="w-6 h-6 text-gray-400" />;
                                                                        }

                                                                        return (
                                                                            <button
                                                                                key={node.id}
                                                                                onClick={() => setActiveNodeId(node.id)}
                                                                                disabled={node.isLocked || !canViewScenario}
                                                                                title={node.name}
                                                                                className={`w-56 h-20 relative text-left p-3 rounded-lg border transition-all duration-300 bg-white border-gray-200 hover:border-gray-400 flex flex-col justify-between
                                                                                    ${(isSelected && canViewScenario) ? 'ring-2 ring-sky-500' : ''}
                                                                                    ${node.isLocked ? 'opacity-60' : ''}
                                                                                    ${isRunning ? 'ring-2 ring-blue-500 animate-pulse' : ''}
                                                                                    ${(node.isLocked || !canViewScenario) ? 'cursor-not-allowed' : ''}`
                                                                                }
                                                                            >
                                                                                <div className="absolute top-3 right-3 z-20">
                                                                                    {isRunning ? <StepSpinner /> : statusOverlayIcon}
                                                                                </div>
                                                                                <div className="relative z-10 flex items-center gap-1 pr-8"> 
                                                                                    {node.isLocked && <LockIcon className="w-3 h-3 text-gray-500 flex-shrink-0" />} 
                                                                                    <h4 className="font-semibold text-xs text-gray-900 truncate"> {node.name} </h4> 
                                                                                </div>
                                                                                <div className="relative z-10 mt-2"> <span className={`text-xs px-1.5 py-0-5 rounded-full font-semibold ${node.role === 'TECHNICAL' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>{node.role}</span> </div>
                                                                                {assignedUsers.length > 0 && (
                                                                                    <div className="absolute z-20 bottom-2 right-2 flex flex-row-reverse items-center -space-x-2 space-x-reverse">
                                                                                        {assignedUsers.slice(0, 2).map(u => { 
                                                                                            // FIX: Kiểm tra kỹ userColorMap và userAvatarLabels trước khi truy cập
                                                                                            const colorStyle = (userColorMap && userColorMap[u.id]) || userColorClasses[0]; 
                                                                                            const fullName = u.fullname || u.username;
                                                                                            const avatarText = (userAvatarLabels && userAvatarLabels[u.id]) || '?';
                                                                                            
                                                                                            return (
                                                                                                <div key={u.id} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-1 ring-white ${colorStyle.bg} ${colorStyle.text} shadow-sm`} title={fullName}>
                                                                                                    {avatarText}
                                                                                                </div>
                                                                                            ); 
                                                                                        })}
                                                                                        {assignedUsers.length > 2 && <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-1 ring-white bg-gray-200 text-gray-700 shadow-sm" title={`${assignedUsers.length - 2} người khác`}>+{assignedUsers.length - 2}</div>}
                                                                                    </div>
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                         })}
                                    </div>
                                    {checkpointsInLevel.length > 0 && ( <div className="flex flex-col items-center justify-center self-stretch"> {checkpointsInLevel.map(checkpoint => ( <CheckpointMilestone key={checkpoint.id} checkpoint={checkpoint} onClick={() => setActiveNodeId(checkpoint.id)} activeNodeId={activeNodeId} /> ))} </div> )}
                                    {levelIndex < groupLevels.length - 1 && <WorkflowConnector />}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-lg">
                    {activeNode ? (
                        <DetailView
                            node={activeNode}
                            user={user}
                            drill={drill}
                            steps={steps}
                            users={allUsers}
                            getStepState={getStepState}
                            handleStepStart={handleStepStart}
                            setCompletionModal={setCompletionModal}
                            onConfirmScenario={handleScenarioConfirmation}
                            drillExecData={executionData[drill.id] || {}}
                            scenarios={scenarios}
                            userColorMap={userColorMap}
                            onEvaluateCriterion={handleEvaluateCriterion}
                            onEndDrillFailed={handleEndDrillFailed}
                            autoRunState={autoRunState}
                            onStepSelect={(id) => setSelectedStepId(id === selectedStepId ? null : id)}
                            selectedStepId={selectedStepId}
                            liveLogs={liveLogs}
                            canControlExecution={canControlExecution}
                            hasExecutedSteps={hasExecutedSteps}
                            isAutoRunning={isAutoRunning}
                            rerunModalOpen={rerunModalOpen}
                            onStartAutoRun={handleStartAutoRun}
                            onRerunClick={() => setRerunModalOpen(true)}
                            userAvatarLabels={userAvatarLabels} // Pass prop này vào detail view nếu cần
                        />
                    ) : (
                        <div className="flex items-center justify-center min-h-[200px]">
                            <p className="text-gray-500">{t('selectScenarioToViewSteps')}</p>
                        </div>
                    )}
                </div>

                {selectedStepId && activeNode && activeNode.type === 'AUTOMATION' && (
                    (() => {
                        const selectedStepState = getStepState(selectedStepId);
                        const isSelectedStepRunning = autoRunState.runningSteps.includes(selectedStepId) || selectedStepState.status === 'InProgress';
                        
                        return (
                             <div className="bg-white p-6 rounded-xl shadow-lg">
                                 <StepDetailView
                                    step={steps[selectedStepId]}
                                    state={selectedStepState}
                                    liveLog={liveLogs[selectedStepId]}
                                    onClose={() => setSelectedStepId(null)}
                                    t={t}
                                    canControlExecution={canControlExecution} 
                                    onOverrideStep={handleOverrideStep}
                                    isRunning={isSelectedStepRunning}
                                />
                             </div>
                        );
                    })()
                )}
            </div>

            {completionModal && (
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <CompletionModal
                        step={steps[completionModal.stepId]}
                        onComplete={(result) => handleStepComplete(completionModal.stepId, result)}
                        onClose={() => setCompletionModal(null)}
                    />
                </div>
            )}

            {failedStepTitle && (
                <FailureActionModal
                    t={t}
                    stepTitle={failedStepTitle}
                    onClose={() => setFailedStepInfo(null)}
                />
            )}

            {rerunModalOpen && activeNode && (
                <RerunModal
                    t={t}
                    scenario={activeNode}
                    steps={steps}
                    getStepState={getStepState}
                    onClose={() => setRerunModalOpen(false)}
                    onRerun={handleRerun}
                />
            )}
        </>
    );
};
export default ExecutionScreen;