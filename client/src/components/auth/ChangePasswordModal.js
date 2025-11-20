import React, { useState } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';

const ChangePasswordModal = ({ user, onClose }) => {
    const { t } = useTranslation();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (newPassword !== confirmPassword) {
            setError(t('passwordMismatch'));
            return;
        }
        try {
            const response = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, oldPassword, newPassword }),
            });
            if (!response.ok) {
                 const errData = await response.json();
                 throw new Error(errData.error || 'Failed to change password');
            }
            setSuccess(t('passwordChangedSuccess'));
            setTimeout(() => onClose(), 2000);
        } catch (err) {
            setError(t('passwordChangedError'));
            console.error(err);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
                <h3 className="text-lg font-bold text-gray-900 mb-4">{t('changePassword')}</h3>
                {error && <p className="text-red-500 text-sm my-2">{error}</p>}
                {success && <p className="text-green-600 text-sm my-2">{success}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('oldPassword')}</label>
                        <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t('newPassword')}</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" required />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">{t('confirmNewPassword')}</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none" required />
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                        <button type="button" onClick={onClose} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">{t('cancel')}</button>
                        <button type="submit" className="bg-[#00558F] hover:bg-[#004472] text-white font-semibold py-2 px-4 rounded-lg">{t('saveChanges')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
