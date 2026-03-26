import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../../utils/apiHelper';
import './AdminPanel.css';

const SubscriptionManagement = () => {
    const [subscriptions, setSubscriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingSub, setEditingSub] = useState(null);
    const [editForm, setEditForm] = useState({ status: '', plan_type: '', end_date: '' });
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    const fetchSubscriptions = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
            const response = await fetch(getApiUrl('subscription'), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setSubscriptions(data.data || []);
            }
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (sub) => {
        setEditingSub(sub);
        setEditForm({
            status: sub.status,
            plan_type: sub.plan_type,
            end_date: sub.end_date ? new Date(sub.end_date).toISOString().split('T')[0] : ''
        });
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('supabase_token');
            const response = await fetch(getApiUrl(`subscription/${editingSub.id}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(editForm)
            });
            const data = await response.json();
            if (data.success) {
                setStatusMessage({ type: 'success', text: 'Subscription updated successfully' });
                setEditingSub(null);
                fetchSubscriptions();
            } else {
                setStatusMessage({ type: 'error', text: data.message || 'Failed to update subscription' });
            }
        } catch (error) {
            console.error('Update error:', error);
            setStatusMessage({ type: 'error', text: 'An error occurred during update' });
        }
    };

    return (
        <div className="admin-content p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Subscription Management</h1>
                    <p className="text-gray-600">View and manage user subscriptions</p>
                </div>
            </div>

            {statusMessage && (
                <div className={`p-4 rounded-md mb-6 ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {statusMessage.text}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#055B75]"></div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="p-4 font-semibold text-gray-600">User</th>
                                    <th className="p-4 font-semibold text-gray-600">Plan Type</th>
                                    <th className="p-4 font-semibold text-gray-600">Status</th>
                                    <th className="p-4 font-semibold text-gray-600">End Date</th>
                                    <th className="p-4 font-semibold text-gray-600">Transaction ID</th>
                                    <th className="p-4 font-semibold text-gray-600">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {subscriptions.length > 0 ? subscriptions.map(sub => (
                                    <tr key={sub.id} className="hover:bg-gray-50">
                                        <td className="p-4">
                                            <div className="font-medium text-gray-900">{sub.user_name}</div>
                                            <div className="text-sm text-gray-500">{sub.user_email}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 uppercase">
                                                {sub.plan_type}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                sub.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
                                                sub.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                                sub.status === 'cancelled' ? 'bg-red-100 text-red-800 border-red-200' :
                                                'bg-gray-100 text-gray-800 border-gray-200'
                                            }`}>
                                                {sub.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-700">
                                            {sub.end_date ? new Date(sub.end_date).toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="p-4 text-sm text-gray-500 font-mono">
                                            {sub.transaction_id || 'N/A'}
                                        </td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => handleEditClick(sub)}
                                                className="text-[#055B75] hover:text-[#034457] font-medium"
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-gray-500">
                                            No subscriptions found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingSub && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-800">Edit Subscription</h2>
                            <p className="text-sm text-gray-500 mt-1">For {editingSub.user_name} ({editingSub.user_email})</p>
                        </div>
                        
                        <form onSubmit={handleUpdate} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select 
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#055B75] focus:border-[#055B75]"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="active">Active</option>
                                    <option value="cancelled">Cancelled</option>
                                    <option value="expired">Expired</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Plan Type</label>
                                <select 
                                    value={editForm.plan_type}
                                    onChange={(e) => setEditForm({...editForm, plan_type: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#055B75] focus:border-[#055B75]"
                                >
                                    <option value="monthly">Monthly</option>
                                    <option value="annual">Annual</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                <input 
                                    type="date"
                                    value={editForm.end_date}
                                    onChange={(e) => setEditForm({...editForm, end_date: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#055B75] focus:border-[#055B75]"
                                />
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 mt-6">
                                <button 
                                    type="button"
                                    onClick={() => setEditingSub(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="px-4 py-2 bg-[#055B75] text-white rounded-md hover:bg-[#044a60]"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubscriptionManagement;
