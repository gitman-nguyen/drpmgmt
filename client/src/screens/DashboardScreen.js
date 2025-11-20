import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { OpenIcon, CloseIcon, ExecuteIcon, ReportIcon, EditIcon, CloneIcon, ArrowUpIcon, ArrowDownIcon } from '../components/icons';

const DashboardScreen = ({ user, onExecuteDrill, onViewReport, onEditDrill, onCloneDrill, onCreateDrill }) => {
  const { t } = useTranslation();
  const [sortConfig, setSortConfig] = useState({ key: 'start_date', direction: 'descending' });
  
  const [drills, setDrills] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  
  const fetchDrills = useCallback(async (pageNum = 1) => {
    setIsLoading(true);
    setError(null);
    try {
        const response = await fetch(`/api/data/drills?page=${pageNum}&limit=15`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setDrills(data.data);
        setPagination(data.pagination);
        setPage(data.pagination.page);
    } catch (err) {
        console.error("Failed to fetch drills:", err);
        setError(err.message);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
      fetchDrills(1);
  }, [fetchDrills]);

  const onDataRefresh = () => fetchDrills(page);

  const sortedDrills = useMemo(() => {
    let sortableDrills = [...drills];
    if (sortConfig !== null) {
        sortableDrills.sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (sortConfig.key.includes('_date') || sortConfig.key.includes('_at')) {
                aValue = aValue ? new Date(aValue) : new Date(0);
                bValue = bValue ? new Date(bValue) : new Date(0);
            }

            if (aValue < bValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });
    }
    return sortableDrills;
  }, [drills, sortConfig]);


  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (name) => {
    if (sortConfig.key !== name) {
      return <span className="w-4 h-4 inline-block"></span>;
    }
    if (sortConfig.direction === 'ascending') {
      return <ArrowUpIcon />;
    }
    return <ArrowDownIcon />;
  };
  
  const getStatusClass = (status) => {
    if (status === 'Active') return 'bg-green-100 text-green-800';
    if (status === 'Draft') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-700';
  };
  
  const getExecStatusClass = (status) => {
    if (status === 'InProgress') return 'bg-blue-100 text-blue-800';
    if (status === 'Closed') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-700'; 
  };

  const handleDrillStatusUpdate = async (drill, newStatus) => {
    try {
        const body = { 
            execution_status: newStatus, 
            timestamp: new Date().toISOString() 
        };
        const response = await fetch(`/api/ops/drills/${drill.id}/status`, { 
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Failed to update drill status');
        await onDataRefresh();
    } catch (error) {
        console.error(error);
        alert('Lỗi cập nhật trạng thái Drill.');
    }
  };

  const handleOpenDrill = (drill) => {
    handleDrillStatusUpdate(drill, 'InProgress');
  };
  
  const handleCloseDrill = async (drillId) => {
    try {
        const response = await fetch(`/api/ops/drills/${drillId}/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        
        if (!response.ok) {
            let errorMessage = `Lỗi ${response.status} khi đóng drill.`;
            try {
                const errData = await response.json();
                errorMessage = errData.error || errData.message || errorMessage;
            } catch (jsonError) {
                console.error("Phản hồi không phải JSON:", await response.text());
                errorMessage = `Lỗi server (${response.status}).`;
            }
            throw new Error(errorMessage);
        }
        
        await onDataRefresh();

    } catch (error) {
        console.error(error);
        alert(error.message); 
    }
  };

  const isDrillInTimeframe = (drill) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(drill.start_date);
      const endDate = new Date(drill.end_date);
      return today >= startDate && today <= endDate;
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">{t('drills')}</h2>
        {user.role === 'ADMIN' && (
            <button onClick={onCreateDrill} className="bg-[#00558F] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#004472] transition-all duration-300 shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-800/30">{t('createNewDrill')}</button>
        )}
      </div>
      <div className="overflow-x-auto">
        {isLoading && <div className="text-center p-8 text-gray-500">Đang tải dữ liệu drills...</div>}
        {error && <div className="text-center p-8 text-red-500">Lỗi: {error}</div>}
        {!isLoading && !error && (
            <table className="min-w-full">
                <thead className="border-b border-gray-200">
                    <tr>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('name')}>
                            <div className="flex items-center">{t('drillName')} {getSortIcon('name')}</div>
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('status')}</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('opened_at')}>
                            <div className="flex items-center">{t('startTime')} {getSortIcon('opened_at')}</div>
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('closed_at')}>
                            <div className="flex items-center">{t('endTime')} {getSortIcon('closed_at')}</div>
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('action')}</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedDrills.map(drill => {
                        const inTime = isDrillInTimeframe(drill);
                        return (
                            <tr key={drill.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-3 px-4">
                                    <p className="font-bold text-gray-900">{drill.name}</p>
                                    <p className="text-sm text-gray-500">{drill.description}</p>
                                    <p className="text-xs text-gray-400 mt-1">{t('startDate')}: {new Date(drill.start_date).toLocaleDateString()} - {t('endDate')}: {new Date(drill.end_date).toLocaleDateString()}</p>
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${getStatusClass(drill.status)}`}>
                                            {t(drill.status ? drill.status.toLowerCase() : 'unknown')}
                                        </span>
                                        <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${getExecStatusClass(drill.execution_status)}`}>
                                            {t(drill.execution_status ? drill.execution_status.toLowerCase() : 'unknown')}
                                        </span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-500">
                                    {drill.opened_at && (
                                        <p>{new Date(drill.opened_at).toLocaleString()}</p>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-500">
                                    {drill.closed_at && (
                                        <p>{new Date(drill.closed_at).toLocaleString()}</p>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center space-x-2">
                                        {user.role === 'ADMIN' && drill.execution_status === 'Scheduled' && (
                                            <button 
                                                onClick={() => handleOpenDrill(drill)} 
                                                disabled={!inTime || drill.status !== 'Active'} 
                                                title={
                                                    drill.status !== 'Active' 
                                                    ? t('drillMustBeActive')
                                                    : !inTime 
                                                    ? t('notInTimeframe') 
                                                    : t('openDrill')
                                                }
                                                className="p-2 rounded-lg text-blue-600 bg-blue-100 hover:bg-blue-200 disabled:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed">
                                                <OpenIcon />
                                            </button>
                                        )}
                                        {user.role === 'ADMIN' && drill.execution_status === 'InProgress' && (
                                            <button onClick={() => handleCloseDrill(drill.id)} title={t('closeDrill')} className="p-2 rounded-lg text-red-600 bg-red-100 hover:bg-red-200"><CloseIcon /></button>
                                        )}
                                        {drill.execution_status === 'InProgress' && (
                                            <button onClick={() => onExecuteDrill(drill)} title={t('execute')} className="p-2 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200"><ExecuteIcon /></button>
                                        )}
                                        {drill.execution_status !== 'InProgress' && drill.execution_status !== 'Scheduled' && (
                                            <button onClick={() => onViewReport(drill)} title={t('viewReport')} className="p-2 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200"><ReportIcon /></button>
                                        )}
                                        {user.role === 'ADMIN' && (
                                            <>
                                                <button onClick={() => onEditDrill(drill)} title={t('edit')} className="p-2 rounded-lg text-yellow-600 bg-yellow-100 hover:bg-yellow-200"><EditIcon /></button>
                                                <button onClick={() => onCloneDrill(drill)} title={t('clone')} className="p-2 rounded-lg text-purple-600 bg-purple-100 hover:bg-purple-200"><CloneIcon /></button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
};
export default DashboardScreen;