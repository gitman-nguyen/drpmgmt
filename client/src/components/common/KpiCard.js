import React from 'react';

const KpiCard = ({ title, value, icon, iconBgColor }) => (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex items-center">
        <div className={`p-3 rounded-full mr-4 ${iconBgColor}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    </div>
);

export default KpiCard;
