import React from 'react';

// --- File này chứa tất cả các dependencies, mocks, icons, và utils ---

// 1. Mock LanguageContext
const LanguageContext = React.createContext();

export const useTranslation = () => {
    const t = (key, options) => {
        if (typeof options === 'string') {
            return options || key; 
        }
        if (typeof options === 'object' && options !== null) {
            if (key === 'stepFailed' && options.stepName) {
                return `Bước "${options.stepName}" đã thất bại.`; 
            }
            if (key === 'overrideReasonPrompt') return 'Vui lòng nhập lý do cho hành động này:';
            if (key === 'overrideError') return 'Lỗi ghi đè bước:';
            if (key === 'adminActions') return 'Hành động của Quản trị viên';
            if (key === 'adminActionsDesc') return 'Ghi đè trạng thái của bước này. Hành động này sẽ bỏ qua thực thi lệnh.';
            if (key === 'skipStep') return 'Bỏ qua (Mark as Skipped)';
            if (key === 'forcePass') return 'Ép thành công (Mark as Success)';
            if (key === 'forceFail') return 'Ép thất bại (Mark as Failure)';
            if (key === 'markCompleted') return 'Mark as Completed (Success)';
            if (key === 'confirmScenarioResult') return 'Xác nhận kết quả Kịch bản';
            if (key === 'confirmScenarioResultMessage') return 'Một hoặc nhiều bước đã thất bại. Vui lòng xác nhận kết quả cuối cùng cho kịch bản này.';
            if (key === 'finalResult') return 'Kết quả cuối cùng';
            if (key === 'failureConfirmed') return 'Thất bại - Đã xác nhận (Failure-Confirmed)';
            if (key === 'successOverridden') return 'Thành công - Ghi đè (Success-Overridden)';
            if (key === 'reasonPlaceholder') return 'Nhập lý do, ghi chú hoặc kết quả...';
            if (key === 'confirmResult') return 'Xác nhận Kết quả';
            return key;
        }
        return key;
    };
    return { t };
};

// 2. Inlined Icons
export const GenericIcon = ({ className = "w-5 h-5", ...props }) => (
    <svg
        className={className}
        viewBox="0 0 20 20"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9V5a1 1 0 012 0v4h4a1 1 0 110 2H9a1 1 0 110-2z"
            clipRule="evenodd"
        />
    </svg>
);
export const LockIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
);
export const ClockIcon = (props) => (
     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
);
export const ExternalLinkIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
);
export const UserIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
);
export const CheckpointIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
);
export const CheckCircleIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);
export const XCircleIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
);
export const LinkIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
);
export const PlayIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
);
export const AlertTriangleIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
);
export const RefreshCwIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
);

export const StepSpinner = () => (
    <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


// 3. Utility Functions
export const viewPdfInNewWindow = (pdfDataUri, title) => {
    if (!pdfDataUri) return;
    const newWindow = window.open("", title, "width=800,height=600,resizable,scrollbars");
    if (newWindow) {
        newWindow.document.write(`
            <html>
                <head><title>${title || 'PDF Viewer'}</title><style>body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; } iframe { border: none; }</style></head>
                <body><iframe src="${pdfDataUri}" width="100%" height="100%"></iframe></body>
            </html>
        `);
        newWindow.document.close();
    } else {
        console.warn('Vui lòng cho phép cửa sổ pop-up để xem tệp đính kèm.');
    }
};

export const userColorClasses = [
    { bg: 'bg-blue-100', text: 'text-blue-800' }, { bg: 'bg-green-100', text: 'text-green-800' },
    { bg: 'bg-yellow-100', text: 'text-yellow-800' }, { bg: 'bg-pink-100', text: 'text-pink-800' },
    { bg: 'bg-indigo-100', text: 'text-indigo-800' }, { bg: 'bg-teal-100', text: 'text-teal-800' },
    { bg: 'bg-red-100', text: 'text-red-800' }, { bg: 'bg-cyan-100', text: 'text-cyan-800' },
    { bg: 'bg-purple-100', text: 'text-purple-800' }, { bg: 'bg-orange-100', text: 'text-orange-800' },
];

export const simpleHash = (str) => {
    if (!str) return 0;
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
    return Math.abs(hash);
};

export const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
        return new Date(isoString).toLocaleString('vi-VN', {
            dateStyle: 'short',
            timeStyle: 'medium',
        });
    } catch (e) {
        return 'Invalid Date';
    }
};
