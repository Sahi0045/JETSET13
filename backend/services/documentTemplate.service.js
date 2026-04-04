import supabase from '../config/supabase.js';

export async function getDocumentTemplates(category = null) {
  let query = supabase
    .from('document_templates')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getDocumentTemplateById(id) {
  const { data, error } = await supabase
    .from('document_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createDocumentTemplate(template) {
  const { data, error } = await supabase
    .from('document_templates')
    .insert([{
      name: template.name,
      description: template.description,
      category: template.category,
      file_path: template.filePath,
      file_type: template.fileType,
      language: template.language || 'en',
      created_by: template.createdBy
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDocumentTemplate(id, updates) {
  const { data, error } = await supabase
    .from('document_templates')
    .update({
      name: updates.name,
      description: updates.description,
      category: updates.category,
      is_active: updates.isActive,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDocumentTemplate(id) {
  const { error } = await supabase
    .from('document_templates')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

export async function incrementDownloadCount(id) {
  await supabase
    .from('document_templates')
    .update({ download_count: supabase.raw('download_count + 1') })
    .eq('id', id);
}

export function getDocumentCategories() {
  return [
    { id: 'visa', name: 'Visa Applications', icon: 'passport' },
    { id: 'flight', name: 'Flight Booking', icon: 'plane' },
    { id: 'hotel', name: 'Hotel Booking', icon: 'hotel' },
    { id: 'insurance', name: 'Travel Insurance', icon: 'shield' },
    { id: 'general', name: 'General Documents', icon: 'file' }
  ];
}