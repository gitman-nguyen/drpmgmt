import React, { useState, createContext, useContext } from 'react';
import { translations } from '../translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState('vi');
    
    const t = (key, params = {}) => {
        let text = translations[language][key] || key;
        Object.keys(params).forEach(pKey => {
            text = text.replace(`{${pKey}}`, params[pKey]);
        });
        return text;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useTranslation = () => useContext(LanguageContext);
