import React, { useState } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';

const CompletionModal = ({ step, onComplete, onClose }) => {
    const { t } = useTranslation();
    const [resultText, setResultText] = useState('');
    const [status, setStatus] = useState('Completed-Success');

    const handleSubmit = (e) => {
        e.preventDefault();
        onComplete({ text: resultText, status });
    };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t('completeStepTitle', { stepTitle: step.title })}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">{t('status')}</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                        <option value="Completed-Success">{t('success')}</option>
                        <option value="Completed-Failure">{t('failure')}</option>
                        <option value="Completed-Blocked">{t('blocked')}</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">{t('resultNotes')}</label>
                    <textarea value={resultText} onChange={(e) => setResultText(e.target.value)} rows="4" className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"/>
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                    <button type="button" onClick={onClose} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">{t('cancel')}</button>
                    <button type="submit" className="bg-[#00558F] hover:bg-[#004472] text-white font-semibold py-2 px-4 rounded-lg">{t('submit')}</button>
                </div>
            </form>
        </div>
    );
};

export default CompletionModal;
