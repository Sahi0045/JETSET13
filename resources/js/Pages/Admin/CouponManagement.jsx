import React, { useState, useEffect } from 'react';
import axios from 'axios';

const getApiBase = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD && import.meta.env?.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}/api/coupons`;
  }
  return '/api/coupons';
};

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  minOrderValue: '',
  maxUses: '',
  validFrom: '',
  validUntil: '',
  applicableTo: 'all',
};

const CouponManagement = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const resp = await axios.get(`${getApiBase()}`);
      if (resp.data.success && Array.isArray(resp.data.data)) setCoupons(resp.data.data);
      else setCoupons([]);
    } catch (e) {
      setError('Failed to load coupons.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        discountValue: parseFloat(form.discountValue),
        minOrderValue: form.minOrderValue ? parseFloat(form.minOrderValue) : 0,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
      };

      if (editingId) {
        await axios.put(`${getApiBase()}/${editingId}`, payload);
      } else {
        await axios.post(`${getApiBase()}`, payload);
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      fetchCoupons();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save coupon.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (coupon) => {
    setForm({
      code: coupon.code,
      description: coupon.description || '',
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      minOrderValue: coupon.min_order_value || '',
      maxUses: coupon.max_uses || '',
      validFrom: coupon.valid_from ? coupon.valid_from.substring(0, 16) : '',
      validUntil: coupon.valid_until ? coupon.valid_until.substring(0, 16) : '',
      applicableTo: coupon.applicable_to || 'all',
    });
    setEditingId(coupon.id);
    setShowForm(true);
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this coupon?')) return;
    await axios.delete(`${getApiBase()}/${id}`);
    fetchCoupons();
  };

  const handleToggleActive = async (coupon) => {
    await axios.put(`${getApiBase()}/${coupon.id}`, { is_active: !coupon.is_active });
    fetchCoupons();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Coupon Management</h2>
          <p className="text-sm text-gray-500 mt-1">{coupons.length} coupons total</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(EMPTY_FORM); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#055B75] text-white text-sm font-semibold rounded-xl hover:bg-[#034457] transition-colors"
        >
          <span>+</span> New Coupon
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {showForm && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Edit Coupon' : 'Create New Coupon'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Code */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Code *</label>
              <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="SAVE20" />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="20% off all flights" />
            </div>

            {/* Discount Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Discount Type *</label>
              <select value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>

            {/* Discount Value */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Discount Value *</label>
              <input required type="number" min="0" step="0.01" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder={form.discountType === 'percentage' ? '20' : '15.00'} />
            </div>

            {/* Applicable To */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Applicable To</label>
              <select value={form.applicableTo} onChange={e => setForm({ ...form, applicableTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="all">All Bookings</option>
                <option value="flights">Flights only</option>
                <option value="hotels">Hotels only</option>
                <option value="cruises">Cruises only</option>
                <option value="packages">Packages only</option>
              </select>
            </div>

            {/* Min Order */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Min Order ($)</label>
              <input type="number" min="0" step="0.01" value={form.minOrderValue} onChange={e => setForm({ ...form, minOrderValue: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="0 = no minimum" />
            </div>

            {/* Max Uses */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Max Uses</label>
              <input type="number" min="1" step="1" value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Leave blank = unlimited" />
            </div>

            {/* Valid From */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Valid From</label>
              <input type="datetime-local" value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>

            {/* Valid Until */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Valid Until</label>
              <input type="datetime-local" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>

            {/* Submit */}
            <div className="md:col-span-2 lg:col-span-3 flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="px-6 py-2.5 bg-[#055B75] text-white font-semibold rounded-xl hover:bg-[#034457] transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Update Coupon' : 'Create Coupon'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Coupon Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No coupons yet. Create one!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Code', 'Discount', 'Applicable To', 'Uses', 'Validity', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coupons.map(coupon => (
                  <tr key={coupon.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded">{coupon.code}</span>
                      {coupon.description && <p className="text-xs text-gray-500 mt-0.5">{coupon.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-700">
                      {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`} off
                      {coupon.min_order_value > 0 && <p className="text-xs text-gray-400 font-normal">Min: ${coupon.min_order_value}</p>}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700">{coupon.applicable_to}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {coupon.current_uses || 0}{coupon.max_uses ? ` / ${coupon.max_uses}` : ' / ∞'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {coupon.valid_until ? (
                        <>
                          <span>Until {new Date(coupon.valid_until).toLocaleDateString()}</span>
                          {new Date(coupon.valid_until) < new Date() && (
                            <span className="ml-1 text-red-500">(Expired)</span>
                          )}
                        </>
                      ) : <span className="text-gray-400">No expiry</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(coupon)} className={`px-2 py-1 rounded-full text-xs font-semibold ${coupon.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {coupon.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEdit(coupon)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => handleDeactivate(coupon.id)} className="text-xs font-semibold text-red-500 hover:underline">Disable</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CouponManagement;
