import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../backend/config/supabase.js', () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'test' } }),
          then: (cb) => cb({ data: [{ id: 'test' }] })
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            then: (cb) => cb({ data: [] })
          })
        })
      }),
      insert: vi.fn().mockReturnValue({
        then: (cb) => cb({ data: [{ id: 'test' }], error: null })
      })
    }))
  }
}));

describe('Email Templates Integration', () => {
  it('should have DEFAULT_TEMPLATES defined', async () => {
    const { DEFAULT_TEMPLATES } = await import('../../backend/services/templateResponse.service.js');
    
    expect(DEFAULT_TEMPLATES).toBeDefined();
    expect(DEFAULT_TEMPLATES.visa_approved).toBeDefined();
    expect(DEFAULT_TEMPLATES.visa_approved.subject).toContain('{{applicationRef}}');
  });

  it('should have all required template variables', async () => {
    const { DEFAULT_TEMPLATES } = await import('../../backend/services/templateResponse.service.js');
    
    const template = DEFAULT_TEMPLATES.visa_approved;
    expect(template.variables).toContain('customerName');
    expect(template.variables).toContain('applicationRef');
  });

  it('should render template correctly', async () => {
    const { renderTemplate } = await import('../../backend/services/templateResponse.service.js');
    
    const template = 'Hello {{customerName}}, your ref is {{applicationRef}}';
    const variables = { customerName: 'John', applicationRef: 'VISA-001' };
    
    const result = renderTemplate(template, variables);
    expect(result).toBe('Hello John, your ref is VISA-001');
  });

  it('should handle missing variables gracefully', async () => {
    const { renderTemplate } = await import('../../backend/services/templateResponse.service.js');
    
    const template = 'Hello {{customerName}}, ref: {{applicationRef}}';
    const variables = { customerName: 'John' };
    
    const result = renderTemplate(template, variables);
    expect(result).toBe('Hello John, ref: ');
  });
});

describe('Template Categories', () => {
  it('should have valid TEMPLATE_CATEGORIES', async () => {
    const { TEMPLATE_CATEGORIES } = await import('../../backend/services/templateResponse.service.js');
    
    expect(TEMPLATE_CATEGORIES.VISA).toBe('visa');
    expect(TEMPLATE_CATEGORIES.BOOKING).toBe('booking');
    expect(TEMPLATE_CATEGORIES.PAYMENT).toBe('payment');
    expect(TEMPLATE_CATEGORIES.GENERAL).toBe('general');
  });
});