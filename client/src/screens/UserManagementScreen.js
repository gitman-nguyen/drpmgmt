import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

const UserManagementScreen = ({ users, setUsers, onDataRefresh }) => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', role: 'TECHNICAL', first_name: '', last_name: '', description: '', password: '' });
    
    const roleDescriptions = {
        ADMIN: t('adminRoleDesc'),
        TECHNICAL: t('technicalRoleDesc'),
        BUSINESS: t('businessRoleDesc'),
    };

    const openModalForCreate = () => {
        setEditingUser(null);
        setFormData({ username: '', role: 'TECHNICAL', first_name: '', last_name: '', description: '', password: '' });
        setIsModalOpen(true);
    };

    const openModalForEdit = (user) => {
        setEditingUser(user);
        setFormData({ username: user.username, role: user.role, first_name: user.first_name, last_name: user.last_name, description: user.description });
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        
        if (editingUser) {
            try {
                // CẬP NHẬT: Thêm tiền tố /config
                const response = await fetch(`/api/config/users/${editingUser.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });

                if (!response.ok) throw new Error('Failed to update user');
                const updatedUser = await response.json();
                setUsers(users.map(u => (u.id === editingUser.id ? updatedUser : u)));
            } catch (error) {
                console.error("Update failed:", error);
                alert('Lỗi cập nhật người dùng.');
            }
        } else {
             try {
                // CẬP NHẬT: Thêm tiền tố /config
                const response = await fetch(`/api/config/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });
                if (!response.ok) throw new Error('Failed to create user');
                const newUser = await response.json();
                setUsers([...users, newUser]);
            } catch (error) {
                console.error("Create failed:", error);
                alert('Lỗi tạo người dùng mới.');
            }
        }
        setIsModalOpen(false);
    };

    const handleResetPassword = async (userId) => {
        if (window.confirm(t('resetPasswordConfirmation'))) {
            try {
                // CẬP NHẬT: Thêm tiền tố /config
                const response = await fetch(`/api/config/users/${userId}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_password: 'password' }),
                });
                if (!response.ok) throw new Error('Failed to reset password');
                alert(t('passwordResetSuccess'));
            } catch (error) {
                console.error(error);
                alert(t('passwordResetError'));
            }
        }
    };

    return (
        <>
            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-900">{t('userList')}</h2>
                    <button onClick={openModalForCreate} className="bg-[#00558F] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#004472] transition-all duration-300 shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-800/30">{t('addUser')}</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="border-b border-gray-200">
                            <tr>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('username')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('fullName')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('role')}</th>
                                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('action')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-3 px-4 text-gray-800">{u.username}</td>
                                    <td className="py-3 px-4 text-gray-800">{`${u.last_name} ${u.first_name}`}</td>
                                    <td className="py-3 px-4 text-gray-600">{u.role}</td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center space-x-2">
                                            <button onClick={() => openModalForEdit(u)} className="text-yellow-600 hover:underline">{t('edit')}</button>
                                            <button onClick={() => handleResetPassword(u.id)} className="text-red-600 hover:underline">{t('resetPassword')}</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">{editingUser ? t('editUser') : t('createUser')}</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t('lastName')}</label>
                                    <input type="text" value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t('firstName')}</label>
                                    <input type="text" value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"/>
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">{t('username')}</label>
                                <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"/>
                            </div>
                            {!editingUser && (
                                <div>
                                <label className="block text-sm font-medium text-gray-700">{t('password')}</label>
                                <input type="password" placeholder="Để trống sẽ mặc định là 'password'" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"/>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{t('description')}</label>
                                <input type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">{t('role')}</label>
                                <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-sky-500 focus:outline-none">
                                    <option value="TECHNICAL">TECHNICAL</option>
                                    <option value="BUSINESS">BUSINESS</option>
                                    <option value="ADMIN">ADMIN</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-2 p-2 bg-gray-100 rounded-md">{roleDescriptions[formData.role]}</p>
                            </div>
                            <div className="flex justify-end space-x-2 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-200 py-2 px-4 rounded-lg text-gray-800 hover:bg-gray-300">{t('cancel')}</button>
                                <button type="submit" className="bg-[#00558F] hover:bg-[#004472] text-white font-semibold py-2 px-4 rounded-lg">{t('save')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};
export default UserManagementScreen;