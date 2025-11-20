import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation, simpleHash, userColorClasses } from './ExecutionMocksAndUtils.js';

// --- File này chứa custom hook cho TOÀN BỘ LOGIC STATE ---

export const useExecutionState = ({ user, drillId, drillBasicInfo, onDrillEnded, setActiveScreen, setActiveDrill }) => {
    const { t } = useTranslation();

    // --- State Management ---
    const [activeNodeId, setActiveNodeId] = useState(null);
    const [completionModal, setCompletionModal] = useState(null);
    const [selectedStepId, setSelectedStepId] = useState(null);
    const [isAutoRunning, setIsAutoRunning] = useState(false);
    const [autoRunState, setAutoRunState] = useState({ runningSteps: [] });
    const [failedStepInfo, setFailedStepInfo] = useState(null); 
    const [rerunModalOpen, setRerunModalOpen] = useState(false);
    const [liveLogs, setLiveLogs] = useState({});
    const ws = useRef(null);
    const [drill, setDrill] = useState(drillBasicInfo || null);
    const [scenarios, setScenarios] = useState({});
    const [steps, setSteps] = useState({});
    const [executionData, setExecutionData] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshInterval, setRefreshInterval] = useState(0); 
    const [allUsers, setAllUsers] = useState([]);

    // --- Data Fetching ---
    const fetchExecutionData = useCallback(async () => {
        if (!drillId) {
            setError("Không có ID diễn tập nào được cung cấp.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const [drillRes, scenariosRes, stepsRes] = await Promise.all([
                fetch(`/api/data/drills/${drillId}`), 
                // --- SỬA LỖI ---
                // Endpoint '/api/ops/scenarios' trả về object phân trang {data: [], pagination: {}}
                // Endpoint '/api/ops/scenarios/all' trả về mảng [], đúng như logic .reduce() mong đợi.
                fetch('/api/ops/scenarios/all'), // <-- ĐÃ SỬA TỪ '/api/ops/scenarios'
                // Endpoint '/api/ops/steps' đã trả về mảng, không cần sửa
                fetch('/api/ops/steps')
            ]);
            if (!drillRes.ok) throw new Error(`Không thể tải drill: ${await drillRes.text()}`);
            if (!scenariosRes.ok) throw new Error(`Không thể tải scenarios: ${await scenariosRes.text()}`);
            if (!stepsRes.ok) throw new Error(`Không thể tải steps: ${await stepsRes.text()}`);
            
            const drillData = await drillRes.json();
            
            // allScenariosArray bây giờ sẽ là một mảng, lỗi .reduce() sẽ được khắc phục
            const allScenariosArray = await scenariosRes.json(); 
            const allStepsArray = await stepsRes.json();
            
            // Dòng 49 (theo logic file) sẽ không còn lỗi
            const scenariosMap = allScenariosArray.reduce((acc, scen) => { acc[scen.id] = scen; return acc; }, {});
            const stepsMap = allStepsArray.reduce((acc, step) => { acc[step.id] = step; return acc; }, {});
            
            setDrill(drillData.drill);
            setExecutionData(drillData.executionData || {});
            setScenarios(scenariosMap);
            setSteps(stepsMap);
            setAllUsers(drillData.users || []);
        } catch (err) {
            // Dòng 57 (theo logic file)
            console.error("Failed to fetch execution data:", err);
            setError(`Không thể tải dữ liệu diễn tập: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [drillId]);

    useEffect(() => {
        fetchExecutionData();
    }, [fetchExecutionData]);

    const handleRefresh = useCallback(() => {
        // SỬA LỖI: Thêm kiểm tra !isAutoRunning
        if (!isLoading && !isAutoRunning) {
            setLiveLogs({});
            fetchExecutionData();
        }
    }, [fetchExecutionData, isLoading, isAutoRunning]); // Thêm isAutoRunning

    useEffect(() => {
        if (refreshInterval > 0 && !isAutoRunning) {
            const intervalId = setInterval(handleRefresh, refreshInterval);
            return () => clearInterval(intervalId);
        }
    }, [refreshInterval, handleRefresh, isAutoRunning]);

    useEffect(() => {
        setSelectedStepId(null);
    }, [activeNodeId]);

    // --- Memos (Tính toán dữ liệu) ---
    const userColorMap = useMemo(() => {
        const map = {};
        if (allUsers && allUsers.length > 0) { allUsers.forEach(u => { map[u.id] = userColorClasses[simpleHash(u.id) % userColorClasses.length]; }); }
        return map;
    }, [allUsers]);

    const { groupLevels, allNodes } = useMemo(() => {
        if (!drill || !drill.scenarios || !scenarios) return { groupLevels: [], allNodes: {} };
        const drillExecData = executionData[drill.id] || {};
        const groups = {};
        const scenarioNodes = {};
        drill.scenarios.forEach(item => {
            const scenario = scenarios[item.id];
            if (scenario) {
                const groupName = item.group || t('defaultGroup', 'Khối mặc định');
                if (!groups[groupName]) { groups[groupName] = { name: groupName, id: groupName, scenarios: [], dependsOn: [] }; }
                const scenarioSteps = (scenario.steps || []).map(id => steps[id]).filter(Boolean);
                const scenarioNode = { ...scenario, nodeType: 'scenario', dependsOn: item.dependsOn || [], groupName, checkpoint: Object.values(drill.checkpoints || {}).find(c => c.after_scenario_id === item.id) || null, steps: scenarioSteps.map(s => s.id) };
                groups[groupName].scenarios.push(scenarioNode);
                scenarioNodes[item.id] = scenarioNode;
            }
        });
        Object.values(scenarioNodes).forEach(node => {
            const stepStates = (node.steps || []).map(stepId => drillExecData[stepId]);
            if(stepStates.some(s => s?.status === 'InProgress')) node.executionStatus = 'InProgress';
            else if (stepStates.every(s => s?.status?.startsWith('Completed'))) node.executionStatus = 'Completed';
            else node.executionStatus = 'Pending';
            if (node.checkpoint) {
                // SỬA LỖI LOGIC: Đảm bảo drillExecData[c.id] tồn tại trước khi truy cập .status
                const criteriaStates = (node.checkpoint.criteria || []).map(c => drillExecData[c.id]);
                if (criteriaStates.every(s => s?.status)) { 
                    node.checkpoint.executionStatus = 'Completed'; 
                    node.checkpoint.isPassed = criteriaStates.every(s => s.status === 'Pass');
                }
                else if (criteriaStates.some(s => s?.status)) node.checkpoint.executionStatus = 'InProgress';
                else node.checkpoint.executionStatus = 'Pending';
            }
        });
        const isDependencyMet = (depId) => {
            const depIsScenario = !!scenarioNodes[depId];
            if (depIsScenario) {
                const depNode = scenarioNodes[depId];
                if (depNode.executionStatus !== 'Completed') return false; 
                const stepStates = (depNode.steps || []).map(stepId => drillExecData[stepId]?.status);
                const hasFailure = stepStates.some(s => s === 'Completed-Failure' || s === 'Completed-Blocked');
                const finalStatus = drillExecData[depId]?.final_status;
                if (finalStatus === 'Success-Overridden') return true;
                if (finalStatus === 'Failure-Confirmed') return false;
                if (hasFailure) return false;
                if (depNode.checkpoint && (depNode.checkpoint.executionStatus !== 'Completed' || !depNode.checkpoint.isPassed)) return false;
                return true;
            }
            const sourceScenario = Object.values(scenarioNodes).find(n => n.checkpoint?.id === depId);
            if (sourceScenario?.checkpoint) { return sourceScenario.checkpoint.executionStatus === 'Completed' && sourceScenario.checkpoint.isPassed; }
            return true;
        };
        const isGroupComplete = (groupName) => {
            const group = groups[groupName];
            if (!group) return true;
            return group.scenarios.every(scenNode => isDependencyMet(scenNode.id));
        };
        Object.values(scenarioNodes).forEach(node => {
            const scenarioDepsMet = (node.dependsOn || []).every(isDependencyMet);
            const groupDependencies = drill.group_dependencies || [];
            const dependentGroupNames = groupDependencies.find(g => g.group === node.groupName)?.dependsOn || [];
            const groupDepsMet = dependentGroupNames.every(isGroupComplete);
            node.isLocked = !(scenarioDepsMet && groupDepsMet);
            if (node.checkpoint) { 
                const stepStates = (node.steps || []).map(stepId => drillExecData[stepId]?.status);
                const hasFailure = stepStates.some(s => s === 'Completed-Failure' || s === 'Completed-Blocked');
                const finalStatus = drillExecData[node.id]?.final_status;
                // SỬA LỖI LOGIC: Checkpoint bị khóa nếu kịch bản thất bại (kể cả khi đã ghi đè)
                const scenarioFailed = hasFailure && finalStatus !== 'Success-Overridden';
                node.checkpoint.isLocked = node.executionStatus !== 'Completed' || scenarioFailed || finalStatus === 'Failure-Confirmed';
            }
        });
        const groupAdj = {}, groupInDegree = {};
        Object.values(groups).forEach(group => { groupAdj[group.id] = []; groupInDegree[group.id] = 0; });
        const groupDependencies = drill.group_dependencies || [];
        groupDependencies.forEach(dep => { 
            if (groups[dep.group]) {
                (dep.dependsOn || []).forEach(depId => {
                     if (groupAdj[depId]) {
                        groupAdj[depId].push(dep.group); 
                        groupInDegree[dep.group]++; 
                    }
                });
            }
        });
        const groupQueue = Object.values(groups).filter(group => groupInDegree[group.id] === 0);
        const finalGroupLevels = [];
        while (groupQueue.length > 0) {
            const currentLevel = groupQueue.splice(0, groupQueue.length);
            finalGroupLevels.push(currentLevel);
            currentLevel.forEach(u => { (groupAdj[u.id] || []).forEach(vId => { groupInDegree[vId]--; if (groupInDegree[vId] === 0) groupQueue.push(Object.values(groups).find(group => group.id === vId)); }); });
        }
        const allNodesMap = { ...scenarioNodes };
        Object.values(scenarioNodes).forEach(node => { 
            if (node.checkpoint) { 
                allNodesMap[node.checkpoint.id] = { ...node.checkpoint, nodeType: 'checkpoint', isLocked: node.checkpoint.isLocked }; 
            }
        });
        return { groupLevels: finalGroupLevels, allNodes: allNodesMap };
    }, [drill, scenarios, executionData, t, steps, allUsers]);

    const activeNode = activeNodeId ? allNodes[activeNodeId] : null;

    const onExecutionUpdate = useCallback((drillId, entityId, newData) => {
        setExecutionData(prevExecData => {
            const newDrillData = { ...(prevExecData[drillId] || {}) };
            newDrillData[entityId] = newData;
            return { ...prevExecData, [drillId]: newDrillData };
        });
    }, []); 

    const getStepState = (stepId) => (executionData && executionData[drillId] && executionData[drillId][stepId]) ? executionData[drillId][stepId] : { status: 'Pending' };

    // --- WebSocket Logic ---
    useEffect(() => {
        if (!drill) return; 
        if (!isAutoRunning) {
             if (ws.current) { 
                 console.log("Auto-run is false. Closing WebSocket.");
                 ws.current.onclose = null; 
                 ws.current.close(); 
                 ws.current = null; 
             }
            // SỬA LỖI: Luôn kết nối WebSocket (kể cả khi không auto-run)
            // để nhận cập nhật từ người khác.
            // Xóa: return;
        }
        
        // Sửa lỗi: Chỉ kết nối 1 lần, hoặc kết nối lại nếu bị ngắt
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
             // Đã kết nối, không làm gì cả
        } else {
            console.log("Attempting WebSocket connection..."); // Debug
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = `${protocol}://${window.location.host}/ws/execution/${drill.id}`;
            ws.current = new WebSocket(wsUrl);
            ws.current.onopen = () => console.log("WebSocket connected");
            
            ws.current.onclose = () => { 
                console.warn("WebSocket disconnected."); 
                ws.current = null; 
            };
            ws.current.onerror = (error) => { 
                console.error("WebSocket error:", error); 
                ws.current = null; // Đảm bảo đóng lại khi lỗi
            };
        }
        
        ws.current.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'STEP_UPDATE':
                    onExecutionUpdate(drillId, message.payload.step_id, message.payload); 
                    setFailedStepInfo(prev => (prev && message.payload.step_id === prev.stepId && (message.payload.status === 'Completed-Success' || message.payload.status === 'Completed-Skipped')) ? null : prev);
                    if (message.payload.status === 'Pending') setLiveLogs(prev => { const next = { ...prev }; delete next[message.payload.step_id]; return next; });
                    if (message.payload.status !== 'InProgress') setAutoRunState(prev => ({ ...prev, runningSteps: prev.runningSteps.filter(id => id !== message.payload.step_id) }));
                    break;
                case 'SCENARIO_UPDATE':
                    onExecutionUpdate(drillId, message.payload.id, message.payload); 
                    break;
                // --- START: SỬA LỖI CHECKPOINT (Thêm case còn thiếu) ---
                case 'CRITERION_UPDATE':
                    // Cập nhật trạng thái của criterion trong executionData
                    // Hàm onExecutionUpdate sẽ tự động cập nhật state
                    onExecutionUpdate(drillId, message.payload.criterion_id, message.payload);
                    break;
                // --- END: SỬA LỖI CHECKPOINT ---
                case 'STEP_LOG_UPDATE':
                    setLiveLogs(prev => ({ ...prev, [message.payload.step_id]: (prev[message.payload.step_id] || '') + message.payload.log_chunk }));
                    break;
                case 'LEVEL_START':
                    setAutoRunState(prev => ({ ...prev, runningSteps: [...new Set([...prev.runningSteps, ...message.payload.step_ids])] }));
                    break;
                case 'EXECUTION_PAUSED_ON_FAILURE':
                    setFailedStepInfo({ stepId: message.payload.step_id });
                    setAutoRunState(prevState => ({ ...prevState, runningSteps: [] }));
                    // XÓA: setIsAutoRunning(false); (Theo logic yêu cầu từ lần trước)
                    break;
                case 'EXECUTION_COMPLETE':
                    setIsAutoRunning(false); 
                    setAutoRunState({ runningSteps: [] });
                    console.log("Thực thi kịch bản tự động hoàn tất!");
                    break;
                case 'EXECUTION_ERROR':
                    setIsAutoRunning(false);
                    setAutoRunState({ runningSteps: [] });
                    console.error(`Lỗi thực thi phía server: ${message.payload.error}`);
                    break;
                default:
                    console.warn("Unknown WebSocket message type:", message.type);
            }
        };

        // Sửa lỗi: Cần dọn dẹp websocket khi component bị unmount
        return () => {
            if (ws.current) {
                console.log("Cleaning up WebSocket connection.");
                ws.current.onclose = null; // Ngăn reconnect
                ws.current.close();
                ws.current = null;
            }
        };

    // Sửa lỗi: Bỏ isAutoRunning khỏi dependency array
    // để useEffect này chỉ chạy 1 lần và quản lý kết nối của chính nó
    }, [drill, onExecutionUpdate, drillId]);
    // --- Kết thúc sửa lỗi WebSocket ---

    // --- Permissions ---
    const scenarioIsAutomatic = activeNode && activeNode.nodeType === 'scenario' && activeNode.type === 'AUTOMATION';
    const hasExecutedSteps = activeNode && activeNode.steps && steps && Object.keys(steps).length > 0 && activeNode.steps.some(id => getStepState(id).status !== 'Pending');

     const canControlExecution = useMemo(() => {
         if (user.role === 'ADMIN') return true; 
         if (!activeNode || !drill) return false; 
         if (activeNode.nodeType === 'scenario') {
            const isAssigned = (activeNode.steps || []).some(stepId => drill.step_assignments?.[stepId] === user.id);
            return isAssigned;
         }
         // SỬA LỖI: Cho phép control Checkpoint nếu user là ADMIN hoặc được gán vào kịch bản TRƯỚC ĐÓ
         if (activeNode.nodeType === 'checkpoint') {
             // Tìm kịch bản chứa checkpoint này
             const sourceScenario = Object.values(allNodes).find(n => n.nodeType === 'scenario' && n.checkpoint?.id === activeNode.id);
             if (sourceScenario) {
                 const isAssigned = (sourceScenario.steps || []).some(stepId => drill.step_assignments?.[stepId] === user.id);
                 return isAssigned;
             }
         }
         return false; // Default
     }, [activeNode, drill, user.id, user.role, allNodes]);

    // --- Event Handlers ---
    const updateExecutionStep = async (payload) => {
        try {
            const response = await fetch('/api/ops/execution/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(await response.text());
            const updatedStep = await response.json();
            // Client tự cập nhật state, không chờ WebSocket
            onExecutionUpdate(drill.id, updatedStep.step_id, updatedStep);
        } catch (error) { console.error("Lỗi cập nhật bước thực thi:", error); }
    };

    const handleEvaluateCriterion = async (criterionId, status) => {
        try {
            // Đây là API đang bị 404
            const response = await fetch('/api/ops/execution/checkpoint', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    drill_id: drill.id, 
                    criterion_id: criterionId, 
                    status, 
                    checked_by: user.id 
                }) 
            });
            if (!response.ok) throw new Error(await response.text());
            const updatedCriterion = await response.json();
            // Client tự cập nhật state ngay lập tức
            onExecutionUpdate(drill.id, updatedCriterion.criterion_id, updatedCriterion);
        } catch (error) { 
            // Đây là nơi lỗi 404 đang bị bắt
            console.error("Lỗi đánh giá tiêu chí:", error); 
        }
    };

    const handleEndDrillFailed = async (failedCheckpointNode) => {
        try {
            if (!failedCheckpointNode || !failedCheckpointNode.title) { throw new Error('Không thể kết thúc diễn tập vì thiếu thông tin checkpoint đầu vào.'); }
            const response = await fetch(`/api/ops/drills/${drill.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ execution_status: 'Failed', timestamp: new Date().toISOString(), reason: `Checkpoint "${failedCheckpointNode.title}" failed.`})});
            if (!response.ok) { const errorText = await response.text(); throw new Error(`Yêu cầu server thất bại (HTTP ${response.status}): ${errorText}`); }
            const updatedDrill = await response.json();
            if (onDrillEnded) onDrillEnded(updatedDrill);
            else { if (setActiveDrill) setActiveDrill(updatedDrill); if (setActiveScreen) setActiveScreen('report'); }
        } catch (error) { console.error("Lỗi kết thúc diễn tập:", error); }
    };

     const handleScenarioConfirmation = async (scenId, finalStatus, finalReason) => {
        try {
            const response = await fetch('/api/ops/execution/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drill_id: drill.id, scenario_id: scenId, final_status: finalStatus, final_reason: finalReason }) });
            if (!response.ok) throw new Error(await response.text());
            const confirmedScenario = await response.json();
            // Client tự cập nhật state
            onExecutionUpdate(drill.id, confirmedScenario.scenario_id, { ...confirmedScenario, id: confirmedScenario.scenario_id, type: 'scenario' });
        } catch (error) { console.error("Lỗi xác nhận kịch bản:", error); }
    };

    const handleStepStart = (stepId) => {
        updateExecutionStep({ drill_id: drill.id, step_id: stepId, status: 'InProgress', started_at: new Date().toISOString(), assignee: user.id });
    };

    const handleStepComplete = (stepId, result) => {
        updateExecutionStep({ drill_id: drill.id, step_id: stepId, status: result.status, completed_at: new Date().toISOString(), result_text: result.text, assignee: user.id});
        setCompletionModal(null);
    };

    const handleStartAutoRun = async () => {
        try {
            if (!activeNode || activeNode.nodeType !== 'scenario') return;
            const stepsToRun = activeNode.steps || [];
            if (stepsToRun.length === 0) return;

            const scenarioSteps = activeNode.steps.map(id => steps[id]).filter(Boolean);
            const stepIdSet = new Set(scenarioSteps.map(s => s.id));
            const inDegree = {};
            scenarioSteps.forEach(s => { inDegree[s.id] = 0; });
            scenarioSteps.forEach(s => { (s.dependsOn || []).forEach(depId => { if (stepIdSet.has(depId)) inDegree[s.id]++; }); });
            const firstLevelStepIds = scenarioSteps.filter(s => inDegree[s.id] === 0).map(s => s.id);
            
            setLiveLogs({});
            const response = await fetch(`/api/ops/execution/scenario/${activeNode.id}/rerun`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drill_id: drill.id, steps_to_run: stepsToRun }) });
            if (!response.ok) throw new Error(await response.text());
            
            setIsAutoRunning(true);
            setFailedStepInfo(null);
            setAutoRunState(prev => ({ ...prev, runningSteps: [...new Set([...prev.runningSteps, ...firstLevelStepIds])] }));
            if (firstLevelStepIds.length > 0) setSelectedStepId(firstLevelStepIds[0]);
        } catch (error) { console.error("Lỗi bắt đầu thực thi tự động:", error); }
    };

    const handleRerun = async (stepsToRerun) => {
        try {
            if (!activeNode || activeNode.nodeType !== 'scenario') return;
            const stepsToRerunObjects = stepsToRerun.map(id => steps[id]).filter(Boolean);
            const stepsToRerunIdSet = new Set(stepsToRerun);
            const inDegree = {};
            stepsToRerunObjects.forEach(s => { inDegree[s.id] = 0; });
            stepsToRerunObjects.forEach(s => { (s.dependsOn || []).forEach(depId => { if (stepsToRerunIdSet.has(depId)) inDegree[s.id]++; }); });
            const firstLevelRerunStepIds = stepsToRerunObjects.filter(s => inDegree[s.id] === 0).map(s => s.id);

            setLiveLogs(prev => { const next = { ...prev }; stepsToRerun.forEach(id => delete next[id]); return next; });
            const response = await fetch(`/api/ops/execution/scenario/${activeNode.id}/rerun`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drill_id: drill.id, steps_to_run: stepsToRerun }) });
            if (!response.ok) throw new Error(await response.text());
            
            setIsAutoRunning(true);
            setFailedStepInfo(null);
            setAutoRunState(prev => ({ ...prev, runningSteps: [...new Set([...prev.runningSteps, ...firstLevelRerunStepIds])] }));
            if (firstLevelRerunStepIds.length > 0) setSelectedStepId(firstLevelRerunStepIds[0]);
        } catch (error) { console.error("Lỗi yêu cầu chạy lại:", error); }
    };

    const handleOverrideStep = async (stepId, newStatus) => {
        const reason = "Manual override from Execution Screen";
        try {
            const response = await fetch('/api/ops/execution/step/override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drill_id: drill.id, step_id: stepId, new_status: newStatus, reason: reason, user_name: user.fullname || user.username })
            });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || await response.text()); }
            const updatedStep = await response.json();
            onExecutionUpdate(drill.id, updatedStep.step_id, updatedStep);
            setSelectedStepId(null); 
            if (failedStepInfo && failedStepInfo.stepId === stepId) setFailedStepInfo(null);
        } catch (error) { console.error("Lỗi ghi đè bước:", error); }
    };

    // --- Return all state and handlers ---
    return {
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
        userColorMap,
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
    };
};