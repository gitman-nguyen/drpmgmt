import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { LogoIcon, CheckpointIcon, CheckCircleIcon, XCircleIcon, ClockIcon, LinkIcon } from '../components/icons';

// --- INFOGRAPHIC & UI ICONS ---
const WorkflowConnector = () => (
    <div className="my-4 text-amber-400">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
        </svg>
    </div>
);

const ScenarioSubLevelConnector = () => (
    <div className="my-2 text-sky-400/80">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <polyline points="6 4 12 10 18 4"></polyline>
            <polyline points="6 10 12 16 18 10"></polyline>
            <polyline points="6 16 12 22 18 16"></polyline>
        </svg>
    </div>
);

const RefreshIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
);

// --- UI COMPONENTS ---
const PieChart = ({ percentage, size = 80, strokeWidth = 8, colorClass = 'text-amber-500', textSizeClass = 'text-lg', textColorClass = 'text-slate-700', bgCircleClassProp }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    const bgCircleClass = bgCircleClassProp || (textColorClass === 'text-white' ? 'text-gray-600/50' : 'text-slate-100');

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
                <circle className={bgCircleClass} strokeWidth={strokeWidth} stroke="currentColor" fill="transparent" r={radius} cx={size/2} cy={size/2} />
                <circle className={colorClass} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" stroke="currentColor" fill="transparent" r={radius} cx={size/2} cy={size/2} style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }} />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center font-bold ${textColorClass} ${textSizeClass}`}>{`${Math.round(percentage)}%`}</span>
        </div>
    );
};

// --- REFRESH CONTROLS COMPONENT ---
const RefreshControls = ({ refreshInterval, setRefreshInterval, onRefresh, isLoading, t }) => {
    const refreshIntervals = [
        { value: 0, label: t('refreshOff', 'Tắt') },
        { value: 5000, label: '5s' },
        { value: 60000, label: t('oneMinute', '1 phút') },
        { value: 120000, label: t('twoMinutes', '2 phút') },
        { value: 300000, label: t('fiveMinutes', '5 phút') },
    ];

    return (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <label htmlFor="refresh-interval" className="text-sm text-slate-300 whitespace-nowrap">{t('autoRefresh', 'Tự động làm mới')}:</label>
                <select
                    id="refresh-interval"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="bg-slate-700/80 border border-slate-500 rounded-md py-1 px-2 text-white text-sm focus:ring-amber-400 focus:border-amber-400"
                >
                    {refreshIntervals.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
            <button
                onClick={onRefresh}
                className="p-2 rounded-lg transition-all backdrop-blur-sm bg-slate-700/80 hover:bg-slate-600/80 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
                aria-label={t('refresh', 'Làm mới')}
            >
                <RefreshIcon className={`w-5 h-5 text-white ${isLoading ? 'animate-spin' : ''}`} />
            </button>
        </div>
    );
};


// --- HELPERS & STYLES ---
const userColorClasses = [
    { bg: 'bg-amber-400/20', text: 'text-amber-200' }, 
    { bg: 'bg-emerald-400/20', text: 'text-emerald-200' },
    { bg: 'bg-rose-400/20', text: 'text-rose-200' }, 
    { bg: 'bg-sky-400/20', text: 'text-sky-200' },
    { bg: 'bg-teal-400/20', text: 'text-teal-200' },  
    { bg: 'bg-indigo-400/20', text: 'text-indigo-200' },
];

const neonScenarioColorPalette = [
    { text: 'text-sky-200', border: 'border-sky-400/60', shadow: 'shadow-sky-400/40', ring: 'ring-sky-400' },
    { text: 'text-emerald-200', border: 'border-emerald-400/60', shadow: 'shadow-emerald-400/40', ring: 'ring-emerald-400' },
    { text: 'text-rose-200', border: 'border-rose-400/60', shadow: 'shadow-rose-400/40', ring: 'ring-rose-400' },
    { text: 'text-indigo-200', border: 'border-indigo-400/60', shadow: 'shadow-indigo-400/40', ring: 'ring-indigo-400' },
    { text: 'text-teal-200', border: 'border-teal-400/60', shadow: 'shadow-teal-400/40', ring: 'ring-teal-400' },
];

const simpleHash = (str) => {
    if (!str) return 0;
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
    return Math.abs(hash);
};

const getShortScenarioName = (scenarioNode, t) => {
    if (!scenarioNode || !scenarioNode.name) return '';
    let displayRole = null;
    if (scenarioNode.role === 'TECHNICAL') displayRole = t('roleTechnical', 'Kỹ thuật');
    else if (scenarioNode.role === 'BUSINESS') displayRole = t('roleBusiness', 'Nghiệp vụ');
    
    if (displayRole && scenarioNode.application_name) return `${scenarioNode.application_name} (${displayRole})`;
    return scenarioNode.name;
};

// --- START: HÀM HELPER TÍNH TOÁN % TỔNG THỂ ---
// Tách logic tính toán ra hàm riêng để tái sử dụng
const calculateProgressFromDetails = (drillDetails) => {
    if (!drillDetails) return 0;
    const { executionData, steps: allStepsMap } = drillDetails;
    const drillExecData = executionData || {};
    const allSteps = Object.values(allStepsMap || {});
    const totalDrillSteps = allSteps.length;

    if (totalDrillSteps === 0) {
        return 100; // Không có bước nào = 100% hoàn thành
    }

    const completedDrillSteps = allSteps.filter(step => {
        const stepStatus = drillExecData[step.id]?.status;
        return stepStatus && stepStatus.startsWith('Completed');
    }).length;

    return (completedDrillSteps / totalDrillSteps) * 100;
};
// --- END: HÀM HELPER ---


const PublicDashboard = ({ onLoginRequest }) => {
    const { t, language, setLanguage } = useTranslation();
    const [drills, setDrills] = useState([]);
    const [selectedDrill, setSelectedDrill] = useState(null);
    const [drillDetails, setDrillDetails] = useState(null);
    const [activeNodeId, setActiveNodeId] = useState(null);
    const [now, setNow] = useState(Date.now());
    const [expandedGroups, setExpandedGroups] = useState([]);
    
    const [isListLoading, setIsListLoading] = useState(true);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [refreshInterval, setRefreshInterval] = useState(0); // 0 = off

    const toggleGroupExpansion = (groupId) => {
        setExpandedGroups(prev => 
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    };

    // --- DATA FETCHING LOGIC ---
    const fetchDrillList = useCallback(async () => {
        setIsListLoading(true);
        let initialDrills = [];
        try {
            // 1. Fetch danh sách cơ bản (có thể chứa % bị stale)
            const listResponse = await fetch('/api/data/public/drills');
            if (!listResponse.ok) throw new Error('Network response was not ok');
            initialDrills = await listResponse.json();

            // 2. Gọi API chi tiết cho TỪNG drill để lấy % chính xác (N+1 query)
            const detailPromises = initialDrills.map(drill =>
                fetch(`/api/data/public/drills/${drill.id}`).then(res => {
                    if (res.ok) return res.json();
                    return null; // Xử lý nếu API chi tiết bị lỗi
                })
            );
            
            const detailResults = await Promise.all(detailPromises);

            // 3. Tính toán và merge % chính xác vào danh sách
            const updatedDrills = initialDrills.map((drill, index) => {
                const details = detailResults[index];
                if (details) {
                    const correctProgress = calculateProgressFromDetails(details);
                    return { ...drill, progress: correctProgress }; // Ghi đè % bị stale
                }
                return drill; // Giữ % cũ nếu gọi chi tiết bị lỗi
            });

            setDrills(updatedDrills); // Cập nhật state với danh sách đã sửa %

        } catch (err) {
            console.error("Failed to fetch public drill list or details:", err);
            setError(err.message);
            if (initialDrills.length > 0) setDrills(initialDrills); // Hiển thị danh sách cũ nếu có lỗi
        } finally {
            setIsListLoading(false);
        }
    }, []); // Bỏ dependency (t, ...) vì không còn dùng

    const fetchDrillDetails = useCallback(async () => {
        if (!selectedDrill) return;
        setIsDetailsLoading(true);
        try {
            const response = await fetch(`/api/data/public/drills/${selectedDrill.id}`);
            if (!response.ok) throw new Error('Could not load drill details');
            const data = await response.json(); // 'data' chính là drillDetails
            setDrillDetails(data);

            // --- START: CẬP NHẬT LOGIC (Sử dụng helper) ---
            const calculatedProgress = calculateProgressFromDetails(data);

            console.log(`[DEBUG] Drill ${selectedDrill.id} progress recalculated to: ${calculatedProgress}%`);

            // Cập nhật lại state 'drills' (dùng cho list) với con số mới
            setDrills(prevDrills => 
                prevDrills.map(d => 
                    d.id === selectedDrill.id 
                        ? { ...d, progress: calculatedProgress } // Ghi đè con số % bị cũ
                        : d
                )
            );
            // --- END: CẬP NHẬT LOGIC ---

        } catch (err) {
            console.error("Failed to fetch drill details:", err);
            setError(err.message);
        } finally {
            setIsDetailsLoading(false);
        }
    }, [selectedDrill]); // Dependency không đổi

    const handleRefresh = useCallback(() => {
        fetchDrillList();
        if (selectedDrill) {
            fetchDrillDetails();
        }
    }, [fetchDrillList, fetchDrillDetails, selectedDrill]);

    // Effect for initial list load
    useEffect(() => {
        fetchDrillList();
    }, [fetchDrillList]);

    // Effect for fetching details when a drill is selected
    useEffect(() => {
        if (selectedDrill) {
            fetchDrillDetails();
        } else {
            setDrillDetails(null); // Clear details when going back to list
        }
    }, [selectedDrill, fetchDrillDetails]);

    // Effect for handling the auto-refresh interval
    useEffect(() => {
        if (refreshInterval > 0) {
            const intervalId = setInterval(handleRefresh, refreshInterval);
            return () => clearInterval(intervalId);
        }
    }, [refreshInterval, handleRefresh]);


    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const userColorMap = useMemo(() => {
        const map = {};
        if (drillDetails?.users) { 
            drillDetails.users.forEach(u => { map[u.id] = userColorClasses[simpleHash(u.id) % userColorClasses.length]; }); 
        }
        return map;
    }, [drillDetails?.users]);
    
    const formatDuration = useCallback((ms) => {
        if (ms < 0) ms = 0;
        const s = Math.floor((ms / 1000) % 60), m = Math.floor((ms / (1000 * 60)) % 60), h = Math.floor((ms / (1000 * 60 * 60)) % 24), d = Math.floor(ms / (1000 * 60 * 60 * 24));
        const parts = [];
        if (d > 0) parts.push(`${d}${t('d', 'd')}`); 
        if (h > 0) parts.push(`${h}${t('h', 'h')}`); 
        if (m > 0) parts.push(`${m}${t('m', 'm')}`); 
        if (s >= 0) parts.push(`${s}${t('s', 's')}`);
        return parts.length > 0 ? parts.join(' ') : '0s';
    }, [t]);
    
    // *** FIX START: Centralized logic for structuring and calculating status for groups ***
    const { groupLevels, allNodes } = useMemo(() => {
        if (!drillDetails) return { groupLevels: [], allNodes: {} };
    
        const { drill, scenarios, executionData } = drillDetails;
        const drillExecData = executionData || {};
        
        const groups = {};
        const scenarioNodes = {};
        drill.scenarios.forEach(item => {
            const scenario = scenarios[item.id];
            if (scenario) {
                const groupName = item.group || t('defaultGroup', 'Khối mặc định');
                if (!groups[groupName]) groups[groupName] = { name: groupName, id: groupName, scenarios: [], dependsOn: [] };
                const scenarioNode = { ...scenario, type: 'scenario', dependsOn: item.dependsOn || [], groupName };
                groups[groupName].scenarios.push(scenarioNode);
                scenarioNodes[item.id] = scenarioNode;
            }
        });

        // Calculate status for each group and attach it to the group object
        Object.values(groups).forEach(group => {
            let hasStarted = false;
            let isFullyCompleted = true;
            let hasExplicitInProgress = false;
            let totalSteps = 0;

            group.scenarios.forEach(scenario => {
                if (!scenario.steps || scenario.steps.length === 0) {
                    return; // skip scenarios with no steps
                }
                totalSteps += scenario.steps.length;

                scenario.steps.forEach(step => {
                    const stepStatus = drillExecData[step.id]?.status;

                    if (stepStatus === 'InProgress') {
                        hasExplicitInProgress = true;
                    }

                    if (stepStatus) { // Any defined status means it has started
                        hasStarted = true;
                    }

                    if (!stepStatus || !stepStatus.startsWith('Completed')) {
                        isFullyCompleted = false;
                    }
                });
            });

            if (totalSteps === 0) {
                 group.status = 'Pending';
            } else if (hasExplicitInProgress) {
                group.status = 'InProgress';
            } else if (hasStarted && !isFullyCompleted) {
                // THIS IS THE KEY FIX: If any step has started, but not all are complete,
                // the group is considered "In Progress".
                group.status = 'InProgress';
            } else if (isFullyCompleted) {
                group.status = 'Completed';
            } else {
                group.status = 'Pending';
            }
        });

        const groupDependencies = drill.group_dependencies || [];
        groupDependencies.forEach(dep => {
            if (groups[dep.group]) groups[dep.group].dependsOn = dep.dependsOn || [];
        });

        const groupAdj = {}, groupInDegree = {};
        Object.values(groups).forEach(g => { groupAdj[g.id] = []; groupInDegree[g.id] = 0; });
        Object.values(groups).forEach(group => {
            group.dependsOn.forEach(depId => {
                if (groupAdj[depId]) { groupAdj[depId].push(group.id); groupInDegree[group.id]++; }
            });
        });

        const groupQueue = Object.values(groups).filter(g => groupInDegree[g.id] === 0);
        const finalGroupLevels = [];
        while (groupQueue.length > 0) {
            const levelSize = groupQueue.length;
            const currentLevel = [];
            for (let i = 0; i < levelSize; i++) {
                const u = groupQueue.shift();
                u.scenarios.sort((a,b) => drill.scenarios.findIndex(s => s.id === a.id) - drill.scenarios.findIndex(s => s.id === b.id));
                currentLevel.push(u);
                (groupAdj[u.id] || []).forEach(vId => {
                    groupInDegree[vId]--;
                    if (groupInDegree[vId] === 0) {
                        const groupV = Object.values(groups).find(g => g.id === vId);
                        if (groupV) groupQueue.push(groupV);
                    }
                });
            }
            finalGroupLevels.push(currentLevel);
        }

        // Pre-calculate scenario levels for each group
        Object.values(groups).forEach(group => {
            const scenariosInGroup = group.scenarios;
            if (!scenariosInGroup || scenariosInGroup.length === 0) {
                group.scenarioLevels = [];
                return;
            }

            const scenariosInGroupIdSet = new Set(scenariosInGroup.map(s => s.id));
            const adj = {};
            const inDegree = {};
            scenariosInGroup.forEach(s => {
                adj[s.id] = [];
                inDegree[s.id] = 0;
            });

            scenariosInGroup.forEach(s => {
                (s.dependsOn || []).forEach(depId => {
                    if (scenariosInGroupIdSet.has(depId)) {
                        adj[depId].push(s.id);
                        inDegree[s.id]++;
                    }
                });
            });
            
            const levels = [];
            const processingInDegree = { ...inDegree };
            let queue = scenariosInGroup.filter(s => processingInDegree[s.id] === 0);

            while (queue.length > 0) {
                const currentLevelNodes = [...queue];
                levels.push(currentLevelNodes);
                queue = [];

                currentLevelNodes.forEach(uNode => {
                    (adj[uNode.id] || []).forEach(vId => {
                        processingInDegree[vId]--;
                        if (processingInDegree[vId] === 0) {
                             const vNode = scenariosInGroup.find(s => s.id === vId);
                             if (vNode) queue.push(vNode);
                        }
                    });
                });
            }

            const allNodesInLevels = levels.flat();
            const remainingNodes = scenariosInGroup.filter(s => !allNodesInLevels.some(n => n.id === s.id));
            if (remainingNodes.length > 0) {
                levels.push(remainingNodes);
            }
            
            group.scenarioLevels = levels;
        });


        const allNodesMap = { ...scenarioNodes };
        Object.values(allNodesMap).forEach(node => {
            if (node.type === 'scenario') {
                node.checkpoint = Object.values(drill.checkpoints || {}).find(c => c.after_scenario_id === node.id) || null;
                if (node.checkpoint) allNodesMap[node.checkpoint.id] = { ...node.checkpoint, type: 'checkpoint' };
            }
        });

        return { groupLevels: finalGroupLevels, allNodes: allNodesMap };
    }, [drillDetails, t]);
    // *** FIX END ***

    // Memoization for dynamic stats. Runs every second.
    const allStats = useMemo(() => {
        if (!drillDetails) return {};

        const { drill, steps, users, executionData } = drillDetails;
        const drillExecData = executionData || {};
        const stats = {};

        // Use drillDetails.steps which is the complete map of all steps in the drill
        Object.values(drillDetails.steps || {}).forEach(step => {
            if (!step) return;
            const state = drillExecData[step.id];
            let elapsedTime = '—', executor = null, assigned = null;
            
            if (state?.started_at) {
                elapsedTime = formatDuration((state.completed_at ? new Date(state.completed_at) : now) - new Date(state.started_at));
            }
            const assigneeId = state?.assignee || drill.step_assignments?.[step.id];
            if (assigneeId && users) {
                const user = users.find(u => u.id === assigneeId);
                if (user) {
                    const userName = user.last_name && user.first_name ? `${user.last_name} ${user.first_name}` : (user.fullname || user.username);
                    if (state?.assignee) executor = {name: userName, id: user.id}; else assigned = {name: userName, id: user.id};
                }
            }
            let statusIcon = '🕒';
            if (state?.status === 'InProgress') { statusIcon = '▶️'; }
            else if (state?.status === 'Completed-Success') { statusIcon = '✅'; }
            else if (state?.status?.startsWith('Completed-')) { statusIcon = '❌';}
            stats[step.id] = { elapsedTime, executor, assigned, statusIcon };
        });

        return stats;
    }, [drillDetails, now, formatDuration]);
    
    // Set initially expanded groups when data is available
    useEffect(() => {
        if (drillDetails && groupLevels.length > 0) {
            const allGroups = groupLevels.flat();
            const inProgressGroupIds = allGroups
                .filter(group => group.status === 'InProgress')
                .map(group => group.id);
            
            setExpandedGroups(inProgressGroupIds);
        }
    }, [drillDetails, groupLevels]);

    const renderDrillList = () => (
        <div className="w-full max-w-4xl mx-auto z-10 relative">
            {isListLoading && <div className="text-center text-white">{t('loading', 'Loading...')}</div>}
            {error && <div className="text-center text-red-400">{t('error', 'Error:')} {error}</div>}
            {!isListLoading && !error && (
                drills.length > 0 ? (
                    <div className="space-y-4">
                        {drills.map(drill => {
                             const progress = drill.progress || 0;
                             let colorClass = 'text-gray-400';
                             if (progress === 100) colorClass = 'text-emerald-400';
                             else if (progress > 0) colorClass = 'text-sky-400';

                            return (
                                <div key={drill.id} className="bg-gradient-to-br from-[#2A3A3F]/80 to-[#1E292D]/80 p-6 rounded-2xl border border-[#3D4F56] hover:border-amber-400/50 transition-all duration-300 backdrop-blur-sm shadow-2xl shadow-black/30">
                                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                        <div className="flex-grow">
                                            <h2 className="text-xl font-bold text-white">{drill.name}</h2>
                                            <p className="text-gray-400 mt-1">{drill.description}</p>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <PieChart percentage={progress} size={150} strokeWidth={15} colorClass={colorClass} textSizeClass="text-4xl" textColorClass="text-white" />
                                            <button onClick={() => setSelectedDrill(drill)} className="flex-shrink-0 bg-amber-400 text-black font-bold py-2 px-5 rounded-lg hover:bg-amber-500 transition-all shadow-lg shadow-amber-400/20">
                                                {t('viewProgress')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-center py-16 bg-[#2A3A3F]/60 rounded-2xl">
                        <p className="text-gray-400 text-lg">{t('noActiveDrills')}</p>
                    </div>
                )
            )}
        </div>
    );
    
    // Checkpoint Separator Component
    const CheckpointSeparator = ({ checkpoint }) => {
        if (!checkpoint || !drillDetails) return null;
    
        const drillExecData = drillDetails?.executionData || {};
        const criteriaStates = (checkpoint.criteria || []).map(c => drillExecData[c.id]);
        const isCompleted = criteriaStates.every(s => s?.status);
        const isPassed = isCompleted && criteriaStates.every(s => s.status === 'Pass');
    
        let color = "border-slate-500/60";
        if (isCompleted) {
            color = isPassed ? "border-emerald-500/60" : "border-rose-500/60";
        }
    
        return (
            <div className="w-full max-w-4xl my-6 flex items-center gap-4" onClick={() => setActiveNodeId(checkpoint.id)}>
                <div className={`flex-grow border-t-2 border-dashed ${color}`}></div>
                <div className="flex-shrink-0 flex items-center gap-3 bg-slate-900/40 p-2 px-4 rounded-full border border-slate-600/50 cursor-pointer hover:border-amber-400/50 transition-colors">
                    <CheckpointIcon className={`w-6 h-6 ${isCompleted && !isPassed ? 'text-rose-400' : 'text-amber-400'}`} />
                    <h4 className="font-bold text-md text-amber-200">{checkpoint.title}</h4>
                </div>
                <div className={`flex-grow border-t-2 border-dashed ${color}`}></div>
            </div>
        );
    };

    const renderDrillDetails = () => {
        if (isDetailsLoading && !drillDetails) {
            return <div className="text-center text-white py-20">{t('loading', 'Loading...')}</div>;
        }
        if (!drillDetails) return null;

        const { drill, executionData, steps: allStepsMap } = drillDetails; // Lấy thêm allStepsMap
        const drillExecData = executionData || {};
        
        // --- START: Tính toán % tổng thể (overall) dựa trên dữ liệu chi tiết ---
        const allSteps = Object.values(allStepsMap || {});
        const totalDrillSteps = allSteps.length;
        const completedDrillSteps = allSteps.filter(step => {
            const stepStatus = drillExecData[step.id]?.status;
            return stepStatus && stepStatus.startsWith('Completed');
        }).length;

        let calculatedOverallProgress = 0;
        if (totalDrillSteps > 0) {
            calculatedOverallProgress = (completedDrillSteps / totalDrillSteps) * 100;
        } else if (totalDrillSteps === 0) {
            calculatedOverallProgress = 100; // Coi như 100% nếu không có bước nào
        }
        // --- END: Tính toán % tổng thể ---
        
        const overallProgress = calculatedOverallProgress; // Sử dụng giá trị vừa tính
        const activeNode = activeNodeId ? allNodes[activeNodeId] : null;
        const totalElapsedTime = drill.opened_at ? formatDuration(now - new Date(drill.opened_at).getTime()) : '—';
        
        let overallColorClass = 'text-slate-400';
        if (overallProgress === 100) overallColorClass = 'text-emerald-400';
        else if (overallProgress > 0) overallColorClass = 'text-sky-400';

        return (
             <div className="w-full max-w-7xl mx-auto z-10 relative">
                <div className="bg-white/10 backdrop-blur-lg p-6 rounded-2xl border border-white/20 shadow-lg mb-8 flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-shrink-0">
                        <PieChart percentage={overallProgress} size={120} strokeWidth={10} colorClass={overallColorClass} textSizeClass="text-2xl" textColorClass="text-white"/>
                    </div>
                    <div className="flex-grow text-center md:text-left">
                         <h1 className="text-3xl font-bold text-slate-200">{drill.name}</h1>
                         <p className="text-slate-300 mt-1">{drill.description}</p>
                         <div className="mt-2 flex items-center justify-center md:justify-start gap-2 text-slate-200">
                            <ClockIcon className="w-5 h-5" />
                            <span className="font-semibold">{t('totalTime')}:</span>
                            <span className="font-mono">{totalElapsedTime}</span>
                         </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-white/10 backdrop-blur-lg p-6 rounded-2xl border border-white/20 shadow-xl">
                        <h2 className="text-xl font-bold text-slate-200 mb-6 text-center">Tiến độ diễn tập</h2>
                        <div className="flex flex-col items-center gap-0 p-2">
                            {groupLevels.map((level, levelIndex) => (
                                <React.Fragment key={levelIndex}>
                                    <div className="flex flex-col items-center w-full gap-4">
                                        {level.map(group => {
                                            const scenarioLevels = group.scenarioLevels || [];
                                            const checkpointsForGroup = group.scenarios.map(s => s.checkpoint).filter(Boolean);
                                            const isExpanded = expandedGroups.includes(group.id);
                                            
                                            // *** FIX: Read status directly from group object ***
                                            const isGroupInProgress = group.status === 'InProgress';
                                            const isGroupCompleted = group.status === 'Completed';

                                            let statusTag = null;
                                            if (isGroupInProgress) {
                                                statusTag = <span className="ml-3 text-xs font-semibold px-2 py-1 bg-sky-500/20 text-sky-300 rounded-full">{t('inProgress', 'In Progress')}</span>;
                                            } else if (isGroupCompleted) {
                                                statusTag = <span className="ml-3 text-xs font-semibold px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-full">{t('completed', 'Completed')}</span>;
                                            }
                                            
                                            return (
                                                <React.Fragment key={group.id}>
                                                    <div className={`bg-slate-900/20 backdrop-blur-md p-4 rounded-xl border w-full max-w-4xl transition-all duration-500 border-white/20`}>
                                                        <button 
                                                            onClick={() => toggleGroupExpansion(group.id)} 
                                                            className="w-full flex justify-between items-center text-left"
                                                        >
                                                            <div className="flex items-center">
                                                                <h3 className={`text-lg font-bold ${isGroupInProgress ? 'group-name-in-progress' : 'text-amber-300'}`}>{group.name}</h3>
                                                                {statusTag}
                                                            </div>
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-6 h-6 text-amber-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                <polyline points="6 9 12 15 18 9"></polyline>
                                                            </svg>
                                                        </button>

                                                        <div className={`transition-[max-height] duration-700 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[2000px]' : 'max-h-0'}`}>
                                                            <div className="mt-4">
                                                                {group.dependsOn && group.dependsOn.length > 0 && (
                                                                    <div className="flex items-center gap-2 mb-3 text-xs text-slate-400">
                                                                        <LinkIcon className="w-4 h-4" />
                                                                        <span>{t('dependsOn', 'Phụ thuộc')}: {group.dependsOn.join(', ')}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex flex-col items-center gap-2 pt-8">
                                                                    {scenarioLevels.map((scenarioLevel, sLevelIndex) => (
                                                                        <React.Fragment key={sLevelIndex}>
                                                                            <div className="flex flex-row flex-wrap justify-center gap-4">
                                                                                {scenarioLevel.map((node) => {
                                                                                    // --- START: TÍNH TOÁN LẠI LOGIC HIỂN THỊ ---
                                                                                    const totalSteps = (node.steps || []).length;
                                                                                    const completedSteps = (node.steps || []).filter(step => drillExecData[step.id]?.status?.startsWith('Completed')).length;
                                                                                    
                                                                                    let percentage, colorClass;
                                                                                    
                                                                                    if (totalSteps === 0) {
                                                                                        percentage = 100; // Không có bước nào, coi như hoàn thành 100%
                                                                                        colorClass = 'text-emerald-400'; // Hiển thị màu xanh
                                                                                    } else {
                                                                                        percentage = (completedSteps / totalSteps) * 100;
                                                                                        if (completedSteps === totalSteps) {
                                                                                            colorClass = 'text-emerald-400';
                                                                                        } else if (completedSteps > 0) {
                                                                                            colorClass = 'text-sky-400';
                                                                                        } else {
                                                                                            colorClass = 'text-slate-400';
                                                                                        }
                                                                                    }
                                                                                    
                                                                                    // --- DEBUG LOG START ---
                                                                                    console.log(`[DEBUG] Scenario: ${node.name || node.id}`, {
                                                                                        nodeSteps: node.steps,
                                                                                        totalSteps: totalSteps,
                                                                                        completedSteps: completedSteps,
                                                                                        percentage: percentage
                                                                                    });
                                                                                    // --- DEBUG LOG END ---

                                                                                    // --- END: TÍNH TOÁN LẠI LOGIC HIỂN THỊ ---

                                                                                    return (
                                                                                        <div key={node.id} className="relative group flex flex-col items-center">
                                                                                            <button onClick={() => setActiveNodeId(node.id)} className={`w-72 p-3 rounded-xl text-left transition-all duration-300 border flex items-center gap-4 bg-slate-800/30 ${activeNodeId === node.id ? `shadow-lg ${neonScenarioColorPalette[simpleHash(node.id) % neonScenarioColorPalette.length].shadow} ${neonScenarioColorPalette[simpleHash(node.id) % neonScenarioColorPalette.length].border}` : `${neonScenarioColorPalette[simpleHash(node.id) % neonScenarioColorPalette.length].border} hover:shadow-lg hover:${neonScenarioColorPalette[simpleHash(node.id) % neonScenarioColorPalette.length].shadow} hover:-translate-y-0.5`}`}>
                                                                                                <div className="flex-shrink-0 w-12 h-12">
                                                                                                    <PieChart 
                                                                                                        percentage={percentage} 
                                                                                                        size={48} 
                                                                                                        strokeWidth={5} 
                                                                                                        colorClass={colorClass}
                                                                                                        textSizeClass="text-xs" 
                                                                                                        textColorClass="text-slate-200" 
                                                                                                        bgCircleClassProp="text-white/10" />
                                                                                                </div>
                                                                                                <div className="flex-grow min-w-0">
                                                                                                    <h4 className={`font-bold text-md truncate ${neonScenarioColorPalette[simpleHash(node.id) % neonScenarioColorPalette.length].text}`}>{getShortScenarioName(node, t)}</h4>
                                                                                                </div>
                                                                                            </button>
                                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-sm rounded-md px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 shadow-lg text-center">
                                                                                                {node.name}<div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-slate-800"></div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )
                                                                                })}
                                                                            </div>
                                                                            {sLevelIndex < scenarioLevels.length - 1 && <ScenarioSubLevelConnector />}
                                                                        </React.Fragment>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {checkpointsForGroup.length > 0 && (
                                                        <>
                                                            <ScenarioSubLevelConnector />
                                                            {checkpointsForGroup.map(cp => <CheckpointSeparator key={cp.id} checkpoint={cp} />)}
                                                        </>
                                                    )}
                                                </React.Fragment>
                                            )
                                        })}
                                    </div>
                                    {levelIndex < groupLevels.length - 1 && <WorkflowConnector />}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>

                    <div className={`bg-white/10 backdrop-blur-lg p-6 rounded-2xl border border-white/20 shadow-xl h-fit sticky top-8 transition-all duration-300`}>
                        {!activeNode ? ( 
                            <div className="flex flex-col items-center justify-center h-full text-center py-20">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 text-slate-500 mb-4"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="m12 14-4-4 4-4"/><path d="M16 10h-8"/></svg>
                                <p className="text-slate-400 font-medium">{t('selectScenarioToViewSteps')}</p>
                            </div>
                        ) : (
                            <div>
                                <h2 className={`text-xl font-bold mb-1 text-slate-200`}>{activeNode.name || activeNode.title}</h2>
                                <p className="text-sm text-slate-300 mb-4">
                                    {activeNode.type === 'scenario' ? t('stepsDetail', 'Chi tiết các bước') : t('criteriaDetail', 'Chi tiết các tiêu chí')}
                                </p>
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                                    {(activeNode.type === 'scenario' ? (activeNode.steps || []) : (activeNode.criteria || [])).map((item) => {
                                        const isStep = activeNode.type === 'scenario';
                                        const itemId = item.id, itemTitle = isStep ? item.title : item.criterion_text;
                                        const stats = isStep ? allStats[itemId] : null;
                                        if (isStep && !stats) return null;

                                        let statusContent;
                                        const userToDisplay = stats?.executor || stats?.assigned, colorStyle = userToDisplay ? userColorMap[userToDisplay.id] : null;

                                        if (isStep) {
                                            statusContent = <>{userToDisplay && colorStyle ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${colorStyle.bg} ${colorStyle.text}`}>{userToDisplay.name}</span> : <span />}<span className="font-mono text-slate-300">{stats.elapsedTime}</span></>;
                                        } else {
                                            const state = drillExecData[itemId];
                                            const icon = state?.status === 'Pass' ? <CheckCircleIcon className="w-4 h-4 text-emerald-400"/> : (state?.status === 'Fail' ? <XCircleIcon className="w-4 h-4 text-rose-400"/> : <CheckCircleIcon className="w-4 h-4 text-slate-500"/>);
                                            const statusText = state?.status === 'Pass' ? t('passed') : (state?.status === 'Fail' ? t('failed') : t('pending'));
                                            statusContent = <span className={`flex items-center gap-1.5 font-sans font-medium ${state?.status === 'Pass' ? 'text-emerald-400' : state?.status === 'Fail' ? 'text-rose-400' : 'text-slate-400'}`}>{icon} {statusText}</span>;
                                        }

                                        return(
                                            <div key={itemId} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                <p className={`font-semibold font-sans text-slate-200`}>{isStep && stats ? (stats.statusIcon || '') : ''} {itemTitle}</p>
                                                <div className="pl-6 mt-1.5 flex items-center justify-between text-xs text-slate-300">{statusContent}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
             </div>
        )
    };
    
    // --- MAIN COMPONENT RENDER ---
    return (
        <div className={`min-h-screen font-sans p-4 sm:p-8 relative overflow-hidden bg-[#1D2A2E] text-gray-200`}>
             <style>{`
                @keyframes pulse-text-glow {
                    0%, 100% {
                        color: #fcd34d; /* amber-300 */
                        text-shadow: 0 0 5px rgba(252, 211, 77, 0.4);
                    }
                    50% {
                        color: #fef08a; /* amber-200 */
                        text-shadow: 0 0 15px rgba(254, 240, 138, 0.7);
                    }
                }
                .group-name-in-progress {
                    animation: pulse-text-glow 2.5s infinite ease-in-out;
                }
            `}</style>
            
            {/* === THAY ĐỔI: Tải ảnh nền từ local === */}
            <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url('/assets/images/bidv_background.jpg')` }} ></div>
            
            <div className="absolute inset-0 bg-gradient-to-b from-[#1D2A2E]/50 to-[#1D2A2E]"></div>
            
            <header className="flex justify-between items-center mb-8 z-10 relative">
                <LogoIcon />
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        
                        {/* === THAY ĐỔI: Tải ảnh cờ từ local === */}
                        <button onClick={() => setLanguage('vi')} className={`w-8 h-8 rounded-full overflow-hidden border-2 ${language === 'vi' ? 'border-amber-400' : 'border-transparent'}`}><img src="/assets/images/flag_vietnam.png" alt="Vietnamese" className="w-full h-full object-cover" /></button>
                        <button onClick={() => setLanguage('en')} className={`w-8 h-8 rounded-full overflow-hidden border-2 ${language === 'en' ? 'border-amber-400' : 'border-transparent'}`}><img src="/assets/images/flag_uk.png" alt="English" className="w-full h-full object-cover" /></button>
                    
                    </div>
                    <button onClick={onLoginRequest} className={`text-white font-bold py-2 px-5 rounded-lg transition-all backdrop-blur-sm bg-gray-700/80 hover:bg-gray-600/80`}>
                        {t('loginButton')}
                    </button>
                </div>
            </header>

            {/* --- UNIFIED CONTROL BAR --- */}
            <div className="relative z-10 w-full max-w-7xl mx-auto mb-6 flex justify-between items-center">
                <div className="flex-1">
                    {selectedDrill ? (
                         <button onClick={() => setSelectedDrill(null)} className="text-amber-300 hover:underline text-lg font-medium">&larr; {t('backToList')}</button>
                    ) : (
                         <h1 className="text-3xl md:text-4xl font-bold text-white">{t('publicDashboardTitle')}</h1>
                    )}
                </div>
                 <RefreshControls 
                    refreshInterval={refreshInterval}
                    setRefreshInterval={setRefreshInterval}
                    onRefresh={handleRefresh}
                    isLoading={isListLoading || isDetailsLoading}
                    t={t}
                 />
            </div>


            <main className="relative z-10">
                {selectedDrill ? renderDrillDetails() : renderDrillList()}
            </main>
        </div>
    );
};
export default PublicDashboard;