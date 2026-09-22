import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import Price from '../Components/Price';

/**
 * CouponInput - A reusable coupon input component
 * Props:
 *   orderTotal (number) - the current order total
 *   bookingType (string) - 'flights', 'hotels', 'cruises', 'packages', 'all'
 *   onApply (fn) - callback({ couponId, code, discountAmount, finalTotal })
 *   onRemove (fn) - callback when coupon is removed
 *   formatAmount (fn, optional) - renders an amount. Defaults to <Price>, the
 *     visitor's display currency; the flight review page passes US dollars,
 *     the currency its card is charged in.
 *   initialCode (string, optional) - a code to apply on mount, exactly as if it
 *     had been typed and Apply pressed. The flight review page passes the one
 *     the customer had applied before cancelling on the payment page.
 *   onRefused (fn, optional) - callback(message) when a code is not accepted.
 */
const CouponInput = ({ orderTotal, bookingType = 'all', onApply, onRemove, onRefused, formatAmount, initialCode = '' }) => {
    const showAmount = (amount) => (formatAmount ? formatAmount(amount) : <Price amount={amount} />);
    const [code, setCode] = useState(() => String(initialCode || '').toUpperCase());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [applied, setApplied] = useState(null);
    const { user, loading: authLoading } = useSupabaseAuth();
    // An answer that arrives after this box was replaced - the page remounts it
    // when the total changes - is for a total no longer on the page, and is
    // dropped: applied, it set a discount worked out on the old total. Set back
    // to true on every mount: in development StrictMode mounts, unmounts and
    // mounts again, and a ref only ever set to false dropped every answer.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const getApiBase = () => {
        if (import.meta.env.PROD && import.meta.env.VITE_API_BASE_URL) {
            return `${import.meta.env.VITE_API_BASE_URL}/api/coupons`;
        }
        return '/api/coupons';
    };

    const handleApply = async () => {
        if (!code.trim()) {
            setError('Please enter a coupon code.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const resp = await axios.post(`${getApiBase()}/validate`, {
                code: code.trim(),
                orderTotal,
                bookingType,
                userId: user?.id
            });
            if (!mounted.current) return;

            if (resp.data.success) {
                const result = resp.data;
                setApplied(result);
                onApply && onApply({
                    couponId: result.coupon.id,
                    code: result.coupon.code,
                    discountAmount: result.discountAmount,
                    finalTotal: result.finalTotal
                });
            } else {
                setError(resp.data.message || 'Invalid coupon.');
                onRefused && onRefused(resp.data.message || 'Invalid coupon.');
            }
        } catch (err) {
            if (!mounted.current) return;
            setError(err.response?.data?.message || 'Failed to validate coupon.');
            onRefused && onRefused(err.response?.data?.message || 'Failed to validate coupon.');
        } finally {
            if (mounted.current) setLoading(false);
        }
    };

    // The code given to start with is checked the way Apply checks it - it may
    // have expired or been used up since - once, as soon as the signed-in
    // account is known (the check counts that account's own uses).
    const restoring = useRef(Boolean(initialCode));
    useEffect(() => {
        if (!restoring.current || authLoading) return;
        restoring.current = false;
        handleApply();
    }, [authLoading]);

    const handleRemove = () => {
        setApplied(null);
        setCode('');
        setError(null);
        onRemove && onRemove();
    };

    if (applied) {
        return (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
                <div>
                    <p className="text-sm font-bold text-green-800">
                        🎉 Coupon <span className="font-mono">{applied.coupon.code}</span> applied!
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">
                        {/* In the same form as every other figure in the fare
                            summary; a bare "$" disagreed with the total beside it. */}
                        You save <span className="font-semibold">{showAmount(applied.discountAmount)}</span>. New total: <span className="font-semibold">{showAmount(applied.finalTotal)}</span>
                    </p>
                </div>
                <button
                    onClick={handleRemove}
                    className="text-xs text-red-600 hover:text-red-800 font-semibold ml-4 underline"
                >
                    Remove
                </button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                    placeholder="Enter coupon code"
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                />
                <button
                    onClick={handleApply}
                    disabled={loading}
                    className="px-5 py-2.5 bg-[#055B75] text-white text-sm font-semibold rounded-lg hover:bg-[#034457] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                    {loading ? '...' : 'Apply'}
                </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
        </div>
    );
};

export default CouponInput;
