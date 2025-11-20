import React, { useState, useEffect, useCallback } from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './components/auth/LoginPage';
import PublicDashboard from './screens/PublicDashboard';
import DashboardScreen from './screens/DashboardScreen';
import UserManagementScreen from './screens/UserManagementScreen';
import ScenarioManagementScreen from './screens/ScenarioManagementScreen';
import CreateDrillScreen from './screens/CreateDrillScreen';
import ExecutionScreen from './screens/execution/ExecutionScreen';
import ReportScreen from './screens/ReportScreen';
import AdminScreen from './screens/AdminScreen';
import ServerManagementScreen from './screens/ServerManagementScreen';
import ApplicationManagementScreen from './screens/ApplicationManagementScreen';
// === THAY ĐỔI: Cập nhật đường dẫn import CSS ===
import './assets/css/styles.css'; // Tệp này NAY đã chứa cả font Inter

export default function App() {
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [activeScreen, setActiveScreen] = useState('dashboard');
  
  // activeDrill giờ chỉ chứa ID hoặc thông tin cơ bản, 
  // không chứa toàn bộ dữ liệu chi tiết
  const [activeDrill, setActiveDrill] = useState(null); 
  const [editingDrill, setEditingDrill] = useState(null);
  const [isCloning, setIsCloning] = useState(false); // <-- STATE MỚI ĐỂ BIẾT LÀ ĐANG CLONE
  
  // State `db` không còn chứa toàn bộ CSDL nữa.
  // Nó sẽ chỉ chứa dữ liệu thực sự cần thiết ở cấp toàn cục.
  // Dữ liệu (như drills) sẽ được tải bởi các component con.
  const [db, setDb] = useState({
    users: [], // Vẫn có thể tải users nếu danh sách này nhỏ và cần ở nhiều nơi
    scenarios: {}, // Sẽ được tải theo yêu yêu cầu
    steps: {}, // Sẽ được tải theo yêu cầu
    applications: [] // Vẫn có thể tải
  });
  
  // SỬA ĐỔI: Thêm 'environment' vào state mặc định
  const [settings, setSettings] = useState({ sessionTimeout: 30, environment: 'TEST' });
  const [loading, setLoading] = useState(true); // Chỉ loading session và settings
  const [error, setError] = useState(null);
  const [isXlsxReady, setIsXlsxReady] = useState(false);

  // fetchCoreData: Chỉ tải những gì TUYỆT ĐỐI cần thiết khi khởi động
  // (ví dụ: users, applications, settings). 
  // KHÔNG tải drills, scenarios, steps, executionData.
  const fetchCoreData = useCallback(async () => {
      try {
        setLoading(true);
        
        // SỬA LỖI: Thêm tiền tố /config/
        const [settingsRes, usersRes, appsRes] = await Promise.all([
            fetch('/api/config/settings', { credentials: 'include' }),
            fetch('/api/config/users', { credentials: 'include' }),  
            fetch('/api/config/applications', { credentials: 'include' })
        ]);

        if (settingsRes.ok) {
            const appSettings = await settingsRes.json();
            setSettings(appSettings); // Dòng này sẽ lấy cả 'environment'
        }
        
        const users = usersRes.ok ? await usersRes.json() : [];
        const applications = appsRes.ok ? await appsRes.json() : [];

        setDb(prevDb => ({
            ...prevDb,
            users: users,
            applications: applications,
            // Xóa dữ liệu cũ có thể đã tải
            drills: [], 
            scenarios: {},
            steps: {},
            executionData: {}
        }));

      } catch (e) {
        console.error("Failed to fetch core data:", e);
        setError("Không thể tải dữ liệu cốt lõi từ server.");
      } finally {
        setLoading(false);
      }
    }, []);
  
  // fetchAdminData đã được đổi tên thành fetchCoreData và giảm tải
  // useEffect này chỉ chạy 1 lần khi mount
  useEffect(() => {
    
    // --- SỬA LOGIC KHÔI PHỤC SESSION ---
    const checkSession = async () => {
        try {
            // Thử gọi API /me để kiểm tra session
            const res = await fetch('/api/config/me', { credentials: 'include' });
            if (res.ok) {
                const loggedInUser = await res.json();
                setUser(loggedInUser);
                await fetchCoreData(); // Tải dữ liệu cốt lõi

                // --- SỬA LỖI CÚ PHÁP: Chuyển logic này VÀO TRONG ---
                // Logic này chỉ nên chạy NẾU user đăng nhập thành công
                const savedScreen = localStorage.getItem('drillAppScreen');
                if(savedScreen) setActiveScreen(savedScreen);

                // Khôi phục activeDrill (có thể chỉ là ID)
                const savedDrillId = localStorage.getItem('drillAppDrillId');
                if(savedDrillId) {
                    // Tạm thời set ID, component chi tiết sẽ tải đầy đủ
                    setActiveDrill({ id: savedDrillId }); 
                }
                // --- KẾT THÚC SỬA LỖI CÚ PHÁP ---

            } else {
                // Nếu 401 (không có session), không làm gì cả, user sẽ là null
                setLoading(false);
            }
        } catch (e) {
            console.error("Failed to check session:", e);
            setLoading(false);
        }
    };
    
    checkSession();
    // --- KẾT THÚC SỬA LOGIC ---

    // --- BẮT ĐẦU SỬA LỖI CÚ PHÁP ---
    // Xóa bỏ khối `try...catch` bị lỗi
    // Logic `savedScreen` và `savedDrillId` đã được chuyển
    // vào bên trong `checkSession`
    /*
    const savedScreen = localStorage.getItem('drillAppScreen');
    if(savedScreen) setActiveScreen(savedScreen);

    // Khôi phục activeDrill (có thể chỉ là ID)
    const savedDrillId = localStorage.getItem('drillAppDrillId');
    if(savedDrillId) {
        // Tạm thời set ID, component chi tiết sẽ tải đầy đủ
        setActiveDrill({ id: savedDrillId }); 
    }
} catch(e) { // <-- LỖI CÚ PHÁP ĐÃ ĐƯỢC XÓA
    console.error("Failed to restore session from localStorage", e);
    localStorage.clear();
}
    */
    // --- KẾT THÚC SỬA LỖI CÚ PHÁP ---
    
    // === THAY ĐỔI: Đã xóa code chèn font Inter từ local ===
    // const link = document.createElement('link');
    // link.href = "/assets/css/inter.css"; // Dòng mới
    // link.rel = "stylesheet";
    // document.head.appendChild(link);
    
    // === THAY ĐỔI: Tải SheetJS (xlsx) từ local ===
    const xlsxScript = document.createElement('script');
    // xlsxScript.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"; // Dòng cũ
    
    // --- SỬA LỖI: Quay lại dùng đường dẫn tuyệt đối ---
    xlsxScript.src = "/assets/js/xlsx.full.min.js";
    xlsxScript.async = true;
    xlsxScript.onload = () => setIsXlsxReady(true);
    xlsxScript.onerror = () => {
        console.error("Failed to load SheetJS library from /assets/js/xlsx.full.min.js");
    };
    document.head.appendChild(xlsxScript);

    return () => {
        // if(document.head.contains(link)) document.head.removeChild(link); // ĐÃ XÓA
        if(document.head.contains(xlsxScript)) document.head.removeChild(xlsxScript);
    };
  }, [fetchCoreData]); // Chỉ phụ thuộc vào fetchCoreData

  // Lưu trạng thái vào localStorage
  useEffect(() => {
    try {
        if (user) {
            localStorage.setItem('drillAppScreen', activeScreen);
            if (activeDrill) {
                // Chỉ lưu ID, không lưu object lớn
                localStorage.setItem('drillAppDrillId', activeDrill.id); 
            } else {
                localStorage.removeItem('drillAppDrillId');
            }
        }
    } catch (e) {
        console.error("Failed to save session to localStorage", e);
    }
  }, [activeScreen, activeDrill, user]);

  // Logic này không còn cần thiết vì db.drills không còn là nguồn chân lý nữa
  /*
  useEffect(() => {
    if (activeDrill) {
        const freshDrill = db.drills.find(d => d.id === activeDrill.id);
        if (freshDrill) {
            setActiveDrill(freshDrill);
        }
    }
  }, [db.drills, activeDrill]);
  */

  // === SỬA LỖI CLONE: Reset cờ isCloning khi rời khỏi màn hình ===
  useEffect(() => {
    if (activeScreen !== 'create-drill') {
        setEditingDrill(null);
        setIsCloning(false); // <-- RESET CỜ
    }
  }, [activeScreen]);

  const handleLogin = async (username, password) => {
    try {
        // SỬA LỖI: Thêm tiền tố /config/
        const response = await fetch('/api/config/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });
        if (!response.ok) return false;
        
        const foundUser = await response.json();
        
        // --- SỬA LOGIC LOGIN (CLIENT) ---
        // KHÔNG dùng localStorage cho user
        // localStorage.setItem('drillAppUser', JSON.stringify(foundUser));
        
        // Đã đăng nhập thành công (server đã tạo session)
        // Chỉ cần set state và tải dữ liệu
        setUser(foundUser);
        setShowLogin(false);
        await fetchCoreData(); // Tải dữ liệu cốt lõi
        return true;
        // --- KẾT THÚC SỬA LOGIC ---
    } catch (e) {
        console.error("Login error:", e);
        return false;
    }
  };

  const handleLogout = useCallback(async () => { // <-- Thêm async
    
    // --- SỬA LOGIC LOGOUT ---
    try {
        await fetch('/api/config/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
        console.error("Logout API call failed:", e);
    }
    
    // Xóa localStorage
    // localStorage.removeItem('drillAppUser'); // (Không còn dùng)
    localStorage.removeItem('drillAppScreen');
    localStorage.removeItem('drillAppDrillId');
    setUser(null);
    setActiveScreen('dashboard');
    setActiveDrill(null);
    // Reset db về trạng thái rỗng
    setDb({ users: [], scenarios: {}, steps: {}, executionData: {}, applications: [] });
  }, []);

  // ... (useEffect cho sessionTimeout giữ nguyên) ...
  useEffect(() => {
      if (!user || !settings.sessionTimeout) return;
      let inactivityTimer;
      const resetTimer = () => {
          clearTimeout(inactivityTimer);
          inactivityTimer = setTimeout(() => {
              // Sử dụng một modal tùy chỉnh thay vì alert()
              console.warn("User inactive, logging out.");
              handleLogout();
          }, settings.sessionTimeout * 60 * 1000);
      };
      const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
      activityEvents.forEach(event => window.addEventListener(event, resetTimer));
      resetTimer();
      return () => {
          clearTimeout(inactivityTimer);
          activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
      };
  }, [user, settings.sessionTimeout, handleLogout]);
  
  const handleExecuteDrill = (drill) => {
    setActiveDrill(drill); // drill này chỉ là object cơ bản từ danh sách
    setActiveScreen('execution');
  };
  
  const handleViewReport = (drill) => {
    setActiveDrill(drill); // drill này chỉ là object cơ bản từ danh sách
    setActiveScreen('report');
  };
  
  // === SỬA LỖI CLONE: Đảm bảo set isCloning = false khi Edit ===
  const handleEditDrill = (drill) => {
      // Khi edit, chúng ta cần tải dữ liệu chi tiết
      // CreateDrillScreen sẽ tự làm điều này
      setEditingDrill(drill);
      setIsCloning(false); // <-- Đảm bảo cờ clone là FALSE
      setActiveScreen('create-drill');
  };

  // === SỬA LỖI CLONE: Sửa logic Clone ===
  const handleCloneDrill = (drillToClone) => {
      // KHÔNG xóa ID, KHÔNG tạo object mới
      // Chỉ set drill để edit (CreateDrillScreen sẽ fetch chi tiết)
      setEditingDrill(drillToClone);
      setIsCloning(true); // <-- Đặt cờ báo hiệu đây là Clone
      setActiveScreen('create-drill');
  };

  const handleBackToDashboard = () => {
      setActiveDrill(null);
      setActiveScreen('dashboard');
  }

  // Các hàm handleExecutionUpdate, handleDrillCompletion sẽ cần được xem lại
  // vì executionData không còn được quản lý tập trung ở App.js nữa
  // Tạm thời giữ nguyên
  const handleExecutionUpdate = (drillId, entityId, newData) => {
    /* Logic này có thể cần chuyển vào ExecutionScreen 
       hoặc sử dụng một context riêng cho execution
    */
    setDb(prevDb => {
        const newExecutionData = JSON.parse(JSON.stringify(prevDb.executionData));
        if (!newExecutionData[drillId]) {
            newExecutionData[drillId] = {};
        }
        newExecutionData[drillId][entityId] = newData;
        return { ...prevDb, executionData: newExecutionData };
    });
  };

  const handleDrillCompletion = (updatedDrillData) => {
    /* Logic này cũng cần xem lại.
       Có thể chỉ cần setActiveDrill và chuyển màn hình.
       DashboardScreen sẽ tự động refresh danh sách của nó.
    */
    setActiveDrill(updatedDrillData);
    setActiveScreen('report');
  };


  if (loading && user) {
    return <div className="flex items-center justify-center h-screen bg-[#1D2A2E] text-white">Đang tải dữ liệu...</div>;
  }
  
  if (error) {
    return <div className="flex items-center justify-center h-screen bg-[#1D2A2E] text-yellow-400 p-8 text-center">{error}</div>;
  }

  if (!user) {
    return (
        <LanguageProvider>
            <PublicDashboard onLoginRequest={() => setShowLogin(true)} />
            {showLogin && <LoginPage onLogin={handleLogin} onCancel={() => setShowLogin(false)} />}
        </LanguageProvider>
    );
  }
  
  // onDataRefresh không còn ý nghĩa là "tải lại tất cả"
  // Chúng ta cần truyền các hàm cụ thể hơn
  const onDataRefresh = fetchCoreData; 

  // DashboardScreen giờ sẽ tự fetch 'drills'
  const defaultScreen = <DashboardScreen 
      user={user} 
      onExecuteDrill={handleExecuteDrill} 
      onViewReport={handleViewReport} 
      onEditDrill={handleEditDrill} 
      onCloneDrill={handleCloneDrill} 
      onCreateDrill={() => {
           // === SỬA LỖI CLONE: Reset cờ khi tạo mới ===
          setIsCloning(false);
          setActiveScreen('create-drill');
      }}
      // Chúng ta không truyền drills, executionData, scenarios nữa
      // onDataRefresh cũng sẽ được thay thế bằng logic nội bộ của DashboardScreen
    />;

  const renderScreen = () => {
    switch(activeScreen) {
        case 'dashboard':
            return defaultScreen;
        case 'execution':
            if (!activeDrill) return defaultScreen;
            // ExecutionScreen giờ sẽ tự fetch dữ liệu chi tiết của activeDrill.id
            return <ExecutionScreen 
                user={user} 
                drillId={activeDrill.id} // Chỉ truyền ID
                drillBasicInfo={activeDrill} // Truyền thông tin cơ bản
                onBack={handleBackToDashboard} 
                // users có thể lấy từ db state
                users={db.users} 
                // executionData, scenarios, steps sẽ được tải bên trong
                onDrillEnded={handleDrillCompletion}
              />;
        case 'report':
            if (!activeDrill) return defaultScreen;
            // ReportScreen cũng sẽ tự fetch dữ liệu chi tiết
            return <ReportScreen 
                drillId={activeDrill.id} // Chỉ truyền ID
                drillBasicInfo={activeDrill}
                onBack={handleBackToDashboard} 
                users={db.users}
              />;
        case 'user-management':
             if (user.role !== 'ADMIN') return defaultScreen;
             // Component này sẽ tự fetch /api/config/users
            return <UserManagementScreen users={db.users} setUsers={(newUsers) => setDb({...db, users: newUsers})} onDataRefresh={onDataRefresh} />;
        case 'scenarios':
            // Component này sẽ tự fetch /api/ops/scenarios
            return <ScenarioManagementScreen 
                user={user} 
                users={db.users} // <-- SỬA LỖI: Bổ sung users prop
                onDataRefresh={onDataRefresh} // onDataRefresh giờ chỉ có nghĩa là "tải lại core"
                isXlsxReady={isXlsxReady} 
                // THÊM MỚI (SỬA LỖI): Truyền prop môi trường
                currentEnvironment={settings.environment}
                // Không truyền db và setDb nữa, nó sẽ tự quản lý
            />;
        case 'create-drill':
             if (user.role !== 'ADMIN') return defaultScreen;
             // === SỬA LỖI CLONE: Truyền prop isCloning và onDoneEditing đã sửa ===
            return <CreateDrillScreen 
                setActiveScreen={setActiveScreen} 
                user={user} 
                drillToEdit={editingDrill} 
                isCloning={isCloning} // <-- TRUYỀN CỜ MỚI
                onDoneEditing={() => {
                    setActiveScreen('dashboard');
                    setIsCloning(false); // <-- RESET CỜ KHI THOÁT
                }} 
                onDataRefresh={onDataRefresh}
                // Truyền dữ liệu cần thiết cho việc tạo/sửa
                allUsers={db.users}
                allApplications={db.applications}
             />;
        case 'server-management':
             if (user.role !== 'ADMIN') return defaultScreen;
             // (TỐI ƯU): Truyền isXlsxReady prop
            return <ServerManagementScreen applications={db.applications} onDataRefresh={onDataRefresh} isXlsxReady={isXlsxReady} />;
        case 'application-management':
             if (user.role !== 'ADMIN') return defaultScreen;
            return <ApplicationManagementScreen applications={db.applications} onDataRefresh={onDataRefresh} />;
        case 'admin':
            if (user.role !== 'ADMIN') return defaultScreen;
            return <AdminScreen onDataRefresh={onDataRefresh} />;
        default:
            return defaultScreen;
    }
  }

  return (
    <LanguageProvider>
        <AppLayout user={user} onLogout={handleLogout} activeScreen={activeScreen} setActiveScreen={setActiveScreen} isXlsxReady={isXlsxReady}>
        {renderScreen()}
        </AppLayout>
    </LanguageProvider>
  );
}