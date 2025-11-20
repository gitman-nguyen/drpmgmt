import React, { useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

const ApplicationManagementScreen = ({ applications, onDataRefresh }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false); // No longer loading from its own fetch
    const [error, setError] = useState(null); // Keep for API errors on save/delete
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState(null);

    // Removed fetchApps and useEffect that called it

    const handleOpenModal = (app = null) => {
        setEditingApp(app);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingApp(null);
    };

    const handleSaveApp = async (appData) => {
        const method = editingApp ? 'PUT' : 'POST';
        // CẬP NHẬT: Thêm tiền tố /api/config/
        const url = editingApp ? `/api/config/applications/${editingApp.id}` : '/api/config/applications';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appData),
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || t('operationFailed'));
            }
            // No longer need to call fetchApps(), onDataRefresh will trigger re-render with new props
            await onDataRefresh(); 
            handleCloseModal();
        } catch (err) {
            alert(`${t('errorPrefix')}${err.message}`);
        }
    };

    const handleDeleteApp = async (id) => {
        if (window.confirm(t('confirmDeleteApp'))) {
            try {
                // CẬP NHẬT: Thêm tiền tố /api/config/
                const response = await fetch(`/api/config/applications/${id}`, { method: 'DELETE' });
                if (!response.ok) throw new Error(t('deleteFailed'));
                // No longer need to call fetchApps()
                await onDataRefresh();
            } catch (err) {
                alert(`${t('errorPrefix')}${err.message}`);
            }
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">{t('applicationManagement')}</h1>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus size={18} className="mr-2" />
                    {t('addApplication')}
                </button>
            </div>
            
            {isLoading && <p>{t('loading')}</p>}
            {error && <p className="text-red-500">{error}</p>}
            
            {!isLoading && !error && (
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="text-left py-3 px-4 font-semibold text-sm">{t('applicationName')}</th>
                                <th className="text-left py-3 px-4 font-semibold text-sm">{t('appCode')}</th>
                                <th className="text-left py-3 px-4 font-semibold text-sm">{t('description')}</th>
                                <th className="text-center py-3 px-4 font-semibold text-sm">{t('action')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(applications || []).map(app => (
                                <tr key={app.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4">{app.app_name}</td>
                                    <td className="py-3 px-4"><span className="bg-gray-200 text-gray-800 text-xs font-mono px-2 py-1 rounded">{app.app_code}</span></td>
                                    <td className="py-3 px-4 text-sm text-gray-600">{app.description}</td>
                                    <td className="py-3 px-4 text-center">
                                        <button onClick={() => handleOpenModal(app)} title={t('edit')} className="text-gray-500 hover:text-green-600 p-2"><Edit size={18} /></button>
                                        <button onClick={() => handleDeleteApp(app.id)} title={t('delete')} className="text-gray-500 hover:text-red-600 p-2"><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && <ApplicationModal app={editingApp} onClose={handleCloseModal} onSave={handleSaveApp} />}
        </div>
    );
};


const ApplicationModal = ({ app, onClose, onSave }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        app_name: app?.app_name || '',
        app_code: app?.app_code || '',
        description: app?.description || '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
                <h2 className="text-2xl font-bold mb-6">{app ? t('editApplication') : t('addNewApplication')}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 font-medium mb-2">{t('applicationName')}</label>
                        <input type="text" name="app_name" value={formData.app_name} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded-lg" required />
                    </div>
                     <div className="mb-4">
                        <label className="block text-gray-700 font-medium mb-2">{t('appCode')}</label>
                        <input type="text" name="app_code" value={formData.app_code} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded-lg" required />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 font-medium mb-2">{t('description')}</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows="3" className="w-full border border-gray-300 p-2 rounded-lg"></textarea>
                    </div>
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg hover:bg-gray-300">{t('cancel')}</button>
                        <button type="submit" className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">{t('save')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ApplicationManagementScreen;