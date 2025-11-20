import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { LogoIcon } from '../icons';

const LoginPage = ({ onLogin, onCancel }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // 1. Tạo một Ref để tham chiếu đến input username
  const usernameInputRef = useRef(null); 

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // Đảm bảo focus trở lại input username nếu đăng nhập không thành công
    if (usernameInputRef.current) {
        usernameInputRef.current.focus();
    }

    const success = await onLogin(username, password);
    if (!success) {
      setError(t('invalidCredentials'));
    }
  };

  // 2. Sử dụng useEffect để focus vào input sau khi component được render
  useEffect(() => {
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, []); // [] đảm bảo effect chỉ chạy MỘT lần sau khi mount

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-sm mx-auto relative">
        <button onClick={onCancel} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button>
        <div className="bg-[#2A3A3F]/90 p-8 rounded-2xl shadow-2xl shadow-black/20 border border-[#3D4F56]">
          <div className="flex justify-center mb-6">
            <LogoIcon />
          </div>
          <h1 className="text-2xl font-bold text-center text-white mb-1">{t('loginTitle')}</h1>
          <p className="text-center text-sm text-[#A6B5B9] mb-6">{t('loginSubtitle')}</p>
          {error && <p className="text-yellow-400 text-sm text-center my-4">{error}</p>}
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#A6B5B9] mb-1">{t('username')}</label>
              {/* 3. Gán ref vào input username */}
              <input 
                type="text" 
                ref={usernameInputRef} // Thêm ref
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                className="w-full px-4 py-2 bg-[#1D2A2E] border border-[#3D4F56] rounded-lg focus:ring-2 focus:ring-[#FFDE59] focus:outline-none transition text-gray-200" 
                placeholder="admin, tech_user, biz_user"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#A6B5B9] mb-1">{t('password')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-[#1D2A2E] border border-[#3D4F56] rounded-lg focus:ring-2 focus:ring-[#FFDE59] focus:outline-none transition text-gray-200" placeholder="password"/>
            </div>
            <button type="submit" className="w-full bg-[#FFDE59] text-black font-bold py-3 px-4 rounded-lg hover:bg-yellow-300 transition-all duration-300 shadow-lg shadow-yellow-400/20 hover:shadow-xl hover:shadow-yellow-400/30">{t('loginButton')}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
