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

    const [loadedScenarioIds, setLoadedScenarioIds] = useState(new Set());
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    const stepsRef = useRef(steps);
    const activeNodeRef = useRef(activeNodeId);

    useEffect(() => { stepsRef.current = steps; }, [steps]);
    
    // --- Xử lý khi chuyển Scenario ---
    useEffect(() => {
        activeNodeRef.current = activeNodeId;
        
        // FIX: KHÔNG xóa liveLogs khi chuyển tab
        setSelectedStepId(null);

        // Tải lại chi tiết để đồng bộ log từ Backend
        if (activeNodeId && allNodes[activeNodeId]?.nodeType === 'scenario') {
            fetchScenarioDetails(activeNodeId);
        }
    }, [activeNodeId]); 

    // --- Data Fetching (INITIAL LOAD) ---
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
                fetch('/api/ops/scenarios/all'), 
                fetch('/api/ops/steps')
            ]);
            if (!drillRes.ok) throw new Error(`Không thể tải drill: ${await drillRes.text()}`);
            if (!scenariosRes.ok) throw new Error(`Không thể tải scenarios: ${await scenariosRes.text()}`);
            if (!stepsRes.ok) throw new Error(`Không thể tải steps: ${await stepsRes.text()}`);
            
            const drillData = await drillRes.json();
            const allScenariosArray = await scenariosRes.json(); 
            const allStepsArray = await stepsRes.json();
            
            const scenariosMap = allScenariosArray.reduce((acc, scen) => { acc[scen.id] = scen; return acc; }, {});
            const stepsMap = allStepsArray.reduce((acc, step) => { acc[step.id] = step; return acc; }, {});
            
            const execData = drillData.executionData || {};

            setDrill(drillData.drill);
            setExecutionData(execData);
            setScenarios(scenariosMap);
            setSteps(stepsMap);
            setAllUsers(drillData.users || []);

            const runningStepIds = [];
            if (execData[drillData.drill.id]) {
                Object.entries(execData[drillData.drill.id]).forEach(([stepId, data]) => {
                    if (data && data.status === 'InProgress') {
                        runningStepIds.push(stepId);
                    }
                });
            }
            if (runningStepIds.length > 0) {
                setAutoRunState(prev => ({
                    ...prev,
                    runningSteps: [...new Set([...prev.runningSteps, ...runningStepIds])]
                }));
            }

        } catch (err) {
            console.error("Failed to fetch execution data:", err);
            setError(`Không thể tải dữ liệu diễn tập: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [drillId]);

    useEffect(() => {
        fetchExecutionData();
    }, [fetchExecutionData]);

    // --- Lazy Load Logic ---
    const onExecutionUpdate = useCallback((drillId, entityId, newData) => {
        setExecutionData(prevExecData => {
            const newDrillData = { ...(prevExecData[drillId] || {}) };
            if (entityId === null && typeof newData === 'object') {
                Object.assign(newDrillData, newData);
            } else {
                newDrillData[entityId] = newData;
            }
            return { ...prevExecData, [drillId]: newDrillData };
        });
    }, []);

    const fetchScenarioDetails = useCallback(async (scenarioId) => {
        setIsLoadingDetails(true);
        try {
            const response = await fetch(`/api/data/drills/${drillId}/scenarios/${scenarioId}/details`);
            if (response.ok) {
                const detailsData = await response.json();
                onExecutionUpdate(drillId, null, detailsData);
                setLoadedScenarioIds(prev => new Set(prev).add(scenarioId));

                setLiveLogs(prevLogs => {
                    const newLogs = { ...prevLogs };
                    let hasChanges = false;
                    Object.entries(detailsData).forEach(([stepId, stepData]) => {
                        if (stepData.result_text && (!newLogs[stepId] || newLogs[stepId].length < stepData.result_text.length)) {
                            newLogs[stepId] = stepData.result_text;
                            hasChanges = true;
                        }
                    });
                    return hasChanges ? newLogs : prevLogs;
                });

            } else {
                console.warn("Failed to load details.");
            }
        } catch (err) {
            console.error(`Error loading scenario ${scenarioId}:`, err);
        } finally {
            setIsLoadingDetails(false);
        }
    }, [drillId, onExecutionUpdate]);


    const handleRefresh = useCallback(() => {
        if (!isLoading) {
            fetchExecutionData();
        }
    }, [fetchExecutionData, isLoading]);

    useEffect(() => {
        if (refreshInterval > 0) {
            const intervalId = setInterval(handleRefresh, refreshInterval);
            return () => clearInterval(intervalId);
        }
    }, [refreshInterval, handleRefresh]);


    // --- Memos ---
    const userColorMap = useMemo(() => {
        const map = {};
        if (allUsers && allUsers.length > 0) { allUsers.forEach(u => { map[u.id] = userColorClasses[simpleHash(u.id) % userColorClasses.length]; }); }
        return map;
    }, [allUsers]);

    // --- FIX: Logic hiển thị Tên (Last Name) cải tiến ---
    const userAvatarLabels = useMemo(() => {
        const map = {};
        if (allUsers && allUsers.length > 0) { 
            allUsers.forEach(u => { 
                let label = '?';
                
                // Hàm helper lấy từ cuối cùng
                const getLastWord = (str) => {
                    if (!str || typeof str !== 'string') return '';
                    const parts = str.trim().split(/\s+/);
                    return parts.length > 0 ? parts[parts.length - 1] : '';
                };

                // Ưu tiên 1: Lấy từ cuối của first_name (Ví dụ: "Hoàng Chi" -> "Chi")
                if (u.first_name && u.first_name.trim() !== '') {
                    label = getLastWord(u.first_name);
                } 
                // Ưu tiên 2: Lấy từ cuối của fullname (Ví dụ: "Nguyễn Hoàng Chi" -> "Chi")
                else if (u.fullname && u.fullname.trim() !== '') {
                    label = getLastWord(u.fullname);
                } 
                // Ưu tiên 3: Lấy từ cuối của last_name (nếu dữ liệu bị ngược)
                else if (u.last_name && u.last_name.trim() !== '') {
                    label = getLastWord(u.last_name);
                }
                // Ưu tiên 4: Lấy username
                else if (u.username) {
                    label = u.username.charAt(0);
                }

                // Đảm bảo không rỗng và viết hoa
                map[u.id] = (label || '?').toUpperCase();
            }); 
        }
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
            const scenarioSummary = drillExecData[node.id];
            if (scenarioSummary && scenarioSummary.final_status) {
                 if (scenarioSummary.final_status === 'Success-Overridden' || scenarioSummary.final_status === 'Success') node.executionStatus = 'Completed';
                 else if (scenarioSummary.final_status === 'Failure-Confirmed') node.executionStatus = 'Failed';
                 else node.executionStatus = 'Pending'; 
            } else {
                const stepStates = (node.steps || []).map(stepId => drillExecData[stepId]);
                if(stepStates.some(s => s?.status === 'InProgress')) node.executionStatus = 'InProgress';
                else if (stepStates.length > 0 && stepStates.every(s => s?.status?.startsWith('Completed'))) node.executionStatus = 'Completed';
                else node.executionStatus = 'Pending';
            }

            if (node.checkpoint) {
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

    const getStepState = (stepId) => (executionData && executionData[drillId] && executionData[drillId][stepId]) ? executionData[drillId][stepId] : { status: 'Pending' };

    // --- WebSocket Logic ---
    useEffect(() => {
        if (!drill) return; 
        
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        } else {
            console.log("Attempting WebSocket connection...");
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = `${protocol}://${window.location.host}/ws/execution/${drill.id}`;
            ws.current = new WebSocket(wsUrl);
            ws.current.onopen = () => console.log("WebSocket connected");
            
            ws.current.onclose = () => { console.warn("WebSocket disconnected."); ws.current = null; };
            ws.current.onerror = (error) => { console.error("WebSocket error:", error); ws.current = null; };
        }
        
        ws.current.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'STEP_UPDATE':
                    onExecutionUpdate(drillId, message.payload.step_id, message.payload); 
                    setFailedStepInfo(prev => (prev && message.payload.step_id === prev.stepId && (message.payload.status === 'Completed-Success' || message.payload.status === 'Completed-Skipped')) ? null : prev);
                    if (message.payload.status === 'Pending') setLiveLogs(prev => { const next = { ...prev }; delete next[message.payload.step_id]; return next; });
                    
                    if (message.payload.status === 'InProgress') {
                        setAutoRunState(prev => ({ ...prev, runningSteps: [...new Set([...prev.runningSteps, message.payload.step_id])] }));
                    } else {
                        setAutoRunState(prev => ({ ...prev, runningSteps: prev.runningSteps.filter(id => id !== message.payload.step_id) }));
                    }
                    break;

                case 'SCENARIO_UPDATE':
                    onExecutionUpdate(drillId, message.payload.id, message.payload); 
                    break;
                case 'CRITERION_UPDATE':
                    onExecutionUpdate(drillId, message.payload.criterion_id, message.payload);
                    break;

                case 'STEP_LOG_UPDATE':
                    const stepId = message.payload.step_id;
                    
                    // Cập nhật log cho mọi bước, không lọc theo kịch bản hiện tại
                    setLiveLogs(prev => ({ 
                        ...prev, 
                        [stepId]: (prev[stepId] || '') + message.payload.log_chunk 
                    }));
                    break;
                    
                case 'LEVEL_START':
                    setAutoRunState(prev => ({ ...prev, runningSteps: [...new Set([...prev.runningSteps, ...message.payload.step_ids])] }));
                    break;

                case 'EXECUTION_PAUSED_ON_FAILURE':
                    setFailedStepInfo({ stepId: message.payload.step_id });
                    break;

                case 'EXECUTION_COMPLETE':
                    console.log("Thực thi kịch bản tự động hoàn tất!");
                    break;
                case 'EXECUTION_ERROR':
                    setAutoRunState({ runningSteps: [] });
                    console.error(`Lỗi thực thi phía server: ${message.payload.error}`);
                    break;
                default:
                    console.warn("Unknown WebSocket message type:", message.type);
            }
        };

        return () => {
            if (ws.current) {
                console.log("Cleaning up WebSocket connection.");
                ws.current.onclose = null;
                ws.current.close();
                ws.current = null;
            }
        };

    }, [drill, onExecutionUpdate, drillId]);

    const scenarioIsAutomatic = activeNode && activeNode.nodeType === 'scenario' && activeNode.type === 'AUTOMATION';
    const hasExecutedSteps = activeNode && activeNode.steps && steps && Object.keys(steps).length > 0 && activeNode.steps.some(id => getStepState(id).status !== 'Pending');

     const canControlExecution = useMemo(() => {
         if (user.role === 'ADMIN') return true; 
         if (!activeNode || !drill) return false; 
         if (activeNode.nodeType === 'scenario') {
            const isAssigned = (activeNode.steps || []).some(stepId => drill.step_assignments?.[stepId] === user.id);
            return isAssigned;
         }
         if (activeNode.nodeType === 'checkpoint') {
             const sourceScenario = Object.values(allNodes).find(n => n.nodeType === 'scenario' && n.checkpoint?.id === activeNode.id);
             if (sourceScenario) {
                 const isAssigned = (sourceScenario.steps || []).some(stepId => drill.step_assignments?.[stepId] === user.id);
                 return isAssigned;
             }
         }
         return false; 
     }, [activeNode, drill, user.id, user.role, allNodes]);

    const updateExecutionStep = async (payload) => {
        try {
            const response = await fetch('/api/ops/execution/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(await response.text());
            const updatedStep = await response.json();
            onExecutionUpdate(drill.id, updatedStep.step_id, updatedStep);
        } catch (error) { console.error("Lỗi cập nhật bước thực thi:", error); }
    };

    const handleEvaluateCriterion = async (criterionId, status) => {
        try {
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
            onExecutionUpdate(drill.id, updatedCriterion.criterion_id, updatedCriterion);
        } catch (error) { 
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
            const firstLevelStepIds = scenarioSteps.filter(s => true).map(s => s.id); 
            
            // --- FIX QUAN TRỌNG ---
            // Chỉ xóa log của các bước thuộc kịch bản này, không xóa log của kịch bản khác
            setLiveLogs(prev => {
                const next = { ...prev };
                // Xóa log của các bước sắp chạy để clear màn hình
                if (activeNode.steps) {
                    activeNode.steps.forEach(id => delete next[id]);
                }
                return next;
            });
            
            const response = await fetch(`/api/ops/execution/scenario/${activeNode.id}/rerun`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drill_id: drill.id, steps_to_run: stepsToRun }) });
            
            if (!response.ok) {
                const errorText = await response.text();
                if (errorText.includes("EXECUTION_ALREADY_ACTIVE")) {
                     console.warn("Kịch bản đang được chạy bởi người khác. Đồng bộ trạng thái...");
                     fetchExecutionData();
                     return;
                }
                throw new Error(errorText);
            }
            
            setFailedStepInfo(null);
        } catch (error) { 
            console.error("Lỗi bắt đầu thực thi tự động:", error); 
            setError(error.message);
        }
    };

    // --- FIX ESLINT: Đã thêm tham số stepsToRerun vào hàm ---
    const handleRerun = async (stepsToRerun) => {
        try {
            if (!activeNode || activeNode.nodeType !== 'scenario') return;
            
            // Chỉ xóa log của các bước được chọn chạy lại
            setLiveLogs(prev => { const next = { ...prev }; stepsToRerun.forEach(id => delete next[id]); return next; });
            
            const response = await fetch(`/api/ops/execution/scenario/${activeNode.id}/rerun`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drill_id: drill.id, steps_to_run: stepsToRerun }) });
            
            if (!response.ok) {
                 const errorText = await response.text();
                 if (errorText.includes("EXECUTION_ALREADY_ACTIVE")) {
                     console.warn("Kịch bản đang được chạy lại bởi người khác. Đồng bộ trạng thái...");
                     fetchExecutionData();
                     return;
                 }
                 throw new Error(errorText);
            }
            
            setFailedStepInfo(null);
        } catch (error) { 
            console.error("Lỗi yêu cầu chạy lại:", error); 
            setError(error.message);
        }
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
        isLoadingDetails,
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
        userAvatarLabels, // FIX: Export userAvatarLabels để ExecutionScreen sử dụng
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