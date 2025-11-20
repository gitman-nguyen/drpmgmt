import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';

const DependencySelector = ({ item, itemList, currentIndex, onDependencyChange }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const getItemId = (it) => it.id || `step-${it.title || it.name}`;

    const possibleDependencies = itemList.slice(0, currentIndex);
    const dependencyNames = (item.dependsOn || [])
        .map(depId => {
            const foundItem = itemList.find(i => getItemId(i) === depId);
            return foundItem?.title || foundItem?.name;
        })
        .filter(Boolean)
        .join(', ');

    const handleCheckboxChange = (depId, checked) => {
        const currentDeps = item.dependsOn || [];
        let newDeps;
        if (checked) {
            newDeps = [...currentDeps, depId];
        } else {
            newDeps = currentDeps.filter(id => id !== depId);
        }
        onDependencyChange(newDeps);
    };

    // Sửa lỗi: Đảm bảo việc đóng cửa sổ khi click bên ngoài hoạt động ổn định
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        // Lắng nghe sự kiện mousedown để bắt được click ngay lập tức
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);
    
    return (
        <div className="mt-2 relative" ref={wrapperRef}>
            <label className="text-xs text-gray-400">{t('dependencies')}</label>
            <div className="p-2 mt-1 bg-gray-100 border border-gray-300 rounded-md text-gray-800 min-h-[40px]">
                <p className="text-sm text-gray-600">{dependencyNames || t('noDependencies')}</p>
            </div>
            {possibleDependencies.length > 0 && (
                <button type="button" onClick={() => setIsOpen(prev => !prev)} className="mt-2 text-xs bg-gray-600 hover:bg-gray-500 text-white font-semibold py-1 px-3 rounded">
                    {t('setDependencies')}
                </button>
            )}
            {isOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg p-4">
                    <h4 className="font-bold text-gray-800 mb-2">{t('selectDependencies')}</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {possibleDependencies.map(dep => (
                            <label key={getItemId(dep)} className="flex items-center space-x-2 text-gray-800">
                                <input
                                    type="checkbox"
                                    className="rounded bg-gray-200 border-gray-300 text-sky-600 focus:ring-sky-500"
                                    checked={(item.dependsOn || []).includes(getItemId(dep))}
                                    onChange={(e) => handleCheckboxChange(getItemId(dep), e.target.checked)}
                                />
                                <span>{dep.title || dep.name}</span>
                            </label>
                        ))}
                    </div>
                    {/* Sửa lỗi: Đảm bảo nút Close luôn hoạt động */}
                    <button type="button" onClick={() => setIsOpen(false)} className="mt-3 w-full text-xs bg-[#00558F] hover:bg-[#004472] text-white font-semibold py-1 px-3 rounded">{t('close')}</button>
                </div>
            )}
        </div>
    );
};

export default DependencySelector;
