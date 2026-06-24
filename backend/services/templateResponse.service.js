import supabase from '../config/supabase.js';
import { sendEmail } from './emailService.js';

export const TEMPLATE_CATEGORIES = {
  VISA: 'visa',
  BOOKING: 'booking',
  PAYMENT: 'payment',
  GENERAL: 'general'
};

export const DEFAULT_TEMPLATES = {
  visa_approved: {
    category: TEMPLATE_CATEGORIES.VISA,
    subject: 'Visa Application Approved - {{applicationRef}}',
    body: `Dear {{customerName}},

Congratulations! Your visa application has been approved.

Application Reference: {{applicationRef}}
Destination: {{destination}}
Service Tier: {{serviceTier}}

Next Steps:
1. Check your email for the visa approval letter
2. Review the attached documents
3. Contact us if you have any questions

Thank you for choosing JetSetters!

Best regards,
The JetSetters Team`,
    variables: ['customerName', 'applicationRef', 'destination', 'serviceTier']
  },
  visa_rejected: {
    category: TEMPLATE_CATEGORIES.VISA,
    subject: 'Visa Application Update - {{applicationRef}}',
    body: `Dear {{customerName}},

Thank you for your visa application. Unfortunately, we were unable to approve your application at this time.

Application Reference: {{applicationRef}}
Reason: {{rejectionReason}}

If you believe this was an error or would like to submit a new application, please contact our support team.

Best regards,
The JetSetters Team`,
    variables: ['customerName', 'applicationRef', 'rejectionReason']
  },
  documents_required: {
    category: TEMPLATE_CATEGORIES.VISA,
    subject: 'Additional Documents Required - {{applicationRef}}',
    body: `Dear {{customerName}},

To process your visa application, we need the following additional documents:

{{documentList}}

Please upload these documents through your application portal as soon as possible to avoid delays.

Application Reference: {{applicationRef}}

Best regards,
The JetSetters Team`,
    variables: ['customerName', 'applicationRef', 'documentList']
  },
  payment_received: {
    category: TEMPLATE_CATEGORIES.PAYMENT,
    subject: 'Payment Confirmed - {{reference}}',
    body: `Dear {{customerName}},

We have received your payment.

Reference: {{reference}}
Amount: {{amount}}
Payment Method: {{paymentMethod}}

Your booking is now confirmed. You will receive a confirmation email shortly.

Thank you for choosing JetSetters!

Best regards,
The JetSetters Team`,
    variables: ['customerName', 'reference', 'amount', 'paymentMethod']
  },
  appointment_reminder: {
    category: TEMPLATE_CATEGORIES.VISA,
    subject: 'Appointment Reminder - {{applicationRef}}',
    body: `Dear {{customerName}},

This is a reminder of your upcoming appointment.

Application Reference: {{applicationRef}}
Date: {{appointmentDate}}
Time: {{appointmentTime}}
Location: {{appointmentLocation}}

Please arrive 15 minutes early and bring all required documents.

Best regards,
The JetSetters Team`,
    variables: ['customerName', 'applicationRef', 'appointmentDate', 'appointmentTime', 'appointmentLocation']
  }
};

export async function getTemplates(category = null) {
  let query = supabase
    .from('response_templates')
    .select('*')
    .order('name');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data.length > 0 ? data : Object.entries(DEFAULT_TEMPLATES).map(([key, value]) => ({
    key,
    ...value
  }));
}

export async function getTemplateById(templateId) {
  const { data, error } = await supabase
    .from('response_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) {
    return DEFAULT_TEMPLATES[templateId] || null;
  }
  return data;
}

export async function createTemplate(template) {
  const { data, error } = await supabase
    .from('response_templates')
    .insert([{
      name: template.name,
      category: template.category,
      subject: template.subject,
      body: template.body,
      variables: template.variables || [],
      created_by: template.createdBy
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTemplate(templateId, updates) {
  const { data, error } = await supabase
    .from('response_templates')
    .update({
      name: updates.name,
      subject: updates.subject,
      body: updates.body,
      variables: updates.variables,
      updated_at: new Date().toISOString()
    })
    .eq('id', templateId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplate(templateId) {
  const { error } = await supabase
    .from('response_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;
  return { success: true };
}

export function renderTemplate(template, variables) {
  let rendered = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, value || '');
  }

  // Strip any placeholders for variables that weren't provided, so
  // customer-facing output never leaks raw {{tokens}}.
  rendered = rendered.replace(/{{\s*[\w.]+\s*}}/g, '');

  return rendered;
}

export async function sendTemplateResponse(inquiryId, templateKey, customVariables = {}) {
  const template = await getTemplateById(templateKey);
  if (!template) {
    throw new Error(`Template not found: ${templateKey}`);
  }

  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('*')
    .eq('id', inquiryId)
    .single();

  if (!inquiry) {
    throw new Error(`Inquiry not found: ${inquiryId}`);
  }

  const variables = {
    customerName: inquiry.customer_name || '',
    customerEmail: inquiry.customer_email || '',
    applicationRef: inquiry.id?.slice(-8) || '',
    destination: inquiry.destination || '',
    ...customVariables
  };

  const renderedSubject = renderTemplate(template.subject, variables);
  const renderedBody = renderTemplate(template.body, variables);

  await sendEmail({
    to: inquiry.customer_email,
    subject: renderedSubject,
    html: renderedBody.replace(/\n/g, '<br>')
  });

  await supabase.from('inquiries').update({
    last_template_used: templateKey,
    last_response_at: new Date().toISOString()
  }).eq('id', inquiryId);

  return { success: true, sentTo: inquiry.customer_email };
}

export async function initializeDefaultTemplates() {
  for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
    const { data: existing } = await supabase
      .from('response_templates')
      .select('id')
      .eq('key', key)
      .single();

    if (!existing) {
      await supabase.from('response_templates').insert([{
        key,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        ...template
      }]);
    }
  }
  console.log('[Templates] Default templates initialized');
}