import React, { useState } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import ChangePasswordModal from '../auth/ChangePasswordModal';
import { LogoIcon, DashboardIcon, ScenariosIcon, UsersIcon, AdminIcon, LogoutIcon, KeyIcon, ServerIcon, AppIcon } from '../icons';

const AppLayout = ({ user, onLogout, children, activeScreen, setActiveScreen, isXlsxReady }) => {
  const { t, setLanguage, language } = useTranslation();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const adminLinks = [
    { id: 'dashboard', name: t('dashboard'), icon: <DashboardIcon /> },
    { id: 'scenarios', name: t('scenarioManagement'), icon: <ScenariosIcon /> },
    { id: 'application-management', name: t('applicationManagement', 'Quản lý Ứng dụng'), icon: <AppIcon /> },
    { id: 'server-management', name: t('serverManagement', 'Quản lý Server'), icon: <ServerIcon /> },
    { id: 'user-management', name: t('userManagement'), icon: <UsersIcon /> },
    { id: 'admin', name: t('adminSystem'), icon: <AdminIcon /> },
  ];

  const userLinks = [
    { id: 'dashboard', name: t('dashboard'), icon: <DashboardIcon /> },
    { id: 'scenarios', name: t('scenarioManagement'), icon: <ScenariosIcon /> },
  ];
  
  const screenTitles = {
    'dashboard': t('dashboard'),
    'scenarios': t('scenarioManagement'),
    'application-management': t('applicationManagement', 'Quản lý Ứng dụng'),
    'server-management': t('serverManagement', 'Quản lý Server'),
    'user-management': t('userManagement'),
    'admin': t('adminSystem'),
    'create-drill': t('createNewDrill'),
    'execution': t('execute'),
    'report': t('viewReport'),
  };

  const navLinks = user.role === 'ADMIN' ? adminLinks : userLinks;
  
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { isXlsxReady });
    }
    return child;
  });

  return (
    <>
    <div className="flex h-screen bg-gray-100 text-gray-800 font-sans">
      <nav className="w-64 bg-[#2A3A3F] text-white p-4 hidden md:flex md:flex-col">
        <div className="flex items-center space-x-3 mb-10">
            <LogoIcon />
        </div>
        <ul className="space-y-2">
          {navLinks.map(link => (
             <li key={link.id}>
                <button onClick={() => setActiveScreen(link.id)} className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 text-left ${activeScreen === link.id ? 'bg-[#3D4F56] text-white font-semibold' : 'text-gray-300 hover:bg-[#3D4F56]'}`}>
                    {link.icon}
                    <span>{link.name}</span>
                </button>
             </li>
          ))}
        </ul>
        <div className="mt-auto space-y-2">
          <button onClick={() => setIsPasswordModalOpen(true)} className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-[#3D4F56] text-gray-300 transition-colors duration-200">
            <KeyIcon /><span>{t('changePassword')}</span>
          </button>
          <button onClick={onLogout} className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-red-600/80 text-red-200 transition-colors duration-200">
            <LogoutIcon /><span>{t('logout')}</span>
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col overflow-y-auto">
         <header className="flex-shrink-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center z-10">
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{screenTitles[activeScreen] || activeScreen}</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
                <button onClick={() => setLanguage('vi')} className={`w-8 h-8 rounded-full overflow-hidden border-2 ${language === 'vi' ? 'border-[#00558F]' : 'border-transparent'}`}><img src="/assets/images/flag_vietnam.png" alt="Vietnamese" className="w-full h-full object-cover" /></button>
                <button onClick={() => setLanguage('en')} className={`w-8 h-8 rounded-full overflow-hidden border-2 ${language === 'en' ? 'border-[#00558F]' : 'border-transparent'}`}><img src="/assets/images/flag_uk.png" alt="English" className="w-full h-full object-cover" /></button>
            </div>
            <p className="text-gray-600 text-sm hidden sm:block">{t('welcome')}, <span className="font-semibold text-gray-800">{user.name || user.username}</span></p>
            <button onClick={onLogout} className="md:hidden bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg">{t('logout')}</button>
          </div>
        </header>

        <nav className="bg-white border-b border-gray-200 md:hidden">
            <div className="flex justify-around">
                {navLinks.map(link => (
                    <button key={link.id} onClick={() => setActiveScreen(link.id)} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeScreen === link.id ? 'text-[#00558F] border-b-2 border-[#00558F]' : 'text-gray-500'}`}>
                        {link.name}
                    </button>
                ))}
            </div>
        </nav>

        <main className="p-4 sm:p-6 lg:p-8 flex-1 bg-gray-100">{childrenWithProps}</main>
      </div>
    </div>
    {isPasswordModalOpen && <ChangePasswordModal user={user} onClose={() => setIsPasswordModalOpen(false)} />}
    </>
  );
};

export default AppLayout;

