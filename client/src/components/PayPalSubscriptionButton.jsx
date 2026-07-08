import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api.service';

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

let paypalSdkPromise = null;

const loadPayPalSdk = () => {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (paypalSdkPromise) return paypalSdkPromise;

  paypalSdkPromise = new Promise((resolve, reject) => {
    if (!PAYPAL_CLIENT_ID) {
      reject(new Error('Missing VITE_PAYPAL_CLIENT_ID'));
      return;
    }

    const script = document.createElement('script');
    const params = new URLSearchParams({
      'client-id': PAYPAL_CLIENT_ID,
      vault: 'true',
      intent: 'subscription',
      components: 'buttons',
    });

    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error('Failed to load PayPal checkout.'));
    document.body.appendChild(script);
  });

  return paypalSdkPromise;
};

export default function PayPalSubscriptionButton({ plan, disabled, onRequireLogin, userId }) {
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!plan?.paypalPlanId || disabled) return;

    let isCancelled = false;
    let buttons = null;

    const renderButton = async () => {
      try {
        const paypal = await loadPayPalSdk();
        if (isCancelled || !buttonRef.current) return;

        buttonRef.current.innerHTML = '';
        buttons = paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'blue',
            shape: 'rect',
            label: 'subscribe',
            height: 40,
          },
          createSubscription: (_data, actions) => {
            return actions.subscription.create({
              plan_id: plan.paypalPlanId,
              custom_id: userId,
            });
          },
          onApprove: async (data) => {
            setError('');
            setStatus('Recording subscription...');
            await apiService.recordSubscription({
              planKey: plan.key,
              paypalSubscriptionId: data.subscriptionID,
            });
            navigate('/subscription/confirmed', {
              replace: true,
              state: { planKey: plan.key },
            });
          },
          onError: (err) => {
            console.error('PayPal subscription error:', err);
            setStatus('');
            setError('PayPal checkout failed. Please try again.');
          },
        });

        buttons.render(buttonRef.current);
      } catch (err) {
        console.error(err);
        setStatus('');
        setError(err.message || 'Unable to load PayPal checkout.');
      }
    };

    renderButton();

    return () => {
      isCancelled = true;
      buttons?.close?.();
    };
  }, [disabled, navigate, plan, userId]);

  if (disabled) {
    return (
      <button
        type="button"
        onClick={onRequireLogin}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
      >
        Sign in to subscribe
      </button>
    );
  }

  if (!plan?.paypalPlanId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        PayPal plan ID missing.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={buttonRef} className="min-h-10" />
      {status && <p className="text-xs font-medium text-emerald-700">{status}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
