import twilio from 'twilio';

const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

export const SMS_TEMPLATE = {
  visa_received: 'Your visa application has been received. Ref: {{ref}}. Thank you for choosing JetSetters!',
  visa_approved: 'Great news! Your visa has been approved. Ref: {{ref}}. Check your email for details.',
  visa_rejected: 'Your visa application was not approved this time. Ref: {{ref}}. Contact us for more info.',
  payment_received: 'Payment confirmed for {{service}} - {{amount}}. Ref: {{ref}}',
  documents_required: 'Action required: Please upload missing documents for application {{ref}}',
  appointment_reminder: 'Reminder: Your visa appointment is on {{date}} at {{location}}'
};

export async function sendSMSNotification(phoneNumber, templateKey, variables, userPreferences = {}) {
  if (!client) {
    console.warn('[SMS] Twilio not configured - skipping notification');
    return { success: false, reason: 'Twilio not configured' };
  }

  if (!userPreferences.smsOptIn) {
    console.log('[SMS] User opted out of SMS notifications');
    return { success: false, reason: 'User opted out' };
  }

  try {
    const template = SMS_TEMPLATE[templateKey];
    if (!template) {
      throw new Error(`Unknown template: ${templateKey}`);
    }

    let message = template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    const result = await client.messages.create({
      body: message,
      from: TWILIO_PHONE,
      to: phoneNumber
    });

    console.log(`[SMS] Sent successfully: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('[SMS] Failed to send:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendBulkSMS(recipients) {
  const results = [];
  for (const recipient of recipients) {
    const result = await sendSMSNotification(
      recipient.phone,
      recipient.template,
      recipient.variables,
      recipient.preferences
    );
    results.push({ phone: recipient.phone, ...result });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return results;
}

export async function getUserSmsPreferences(userId) {
  const { data } = await supabase
    .from('user_preferences')
    .select('sms_opt_in, phone')
    .eq('user_id', userId)
    .single();
  
  return data || { smsOptIn: false };
}

export async function updateUserSmsPreferences(userId, optIn, phone) {
  return supabase
    .from('user_preferences')
    .upsert({ user_id: userId, sms_opt_in: optIn, phone }, { onConflict: 'user_id' });
}