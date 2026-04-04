import supabase from '../config/supabase.js';

export async function getVideoTutorials(category = null, language = null) {
  let query = supabase
    .from('video_tutorials')
    .select('*')
    .eq('is_active', true)
    .order('order_index');

  if (category) {
    query = query.eq('category', category);
  }
  if (language) {
    query = query.eq('language', language);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getVideoTutorialById(id) {
  const { data, error } = await supabase
    .from('video_tutorials')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createVideoTutorial(tutorial) {
  const { data, error } = await supabase
    .from('video_tutorials')
    .insert([{
      title: tutorial.title,
      description: tutorial.description,
      category: tutorial.category,
      video_url: tutorial.videoUrl,
      thumbnail_url: tutorial.thumbnailUrl,
      duration_seconds: tutorial.durationSeconds,
      language: tutorial.language || 'en',
      order_index: tutorial.orderIndex || 0
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateVideoTutorial(id, updates) {
  const { data, error } = await supabase
    .from('video_tutorials')
    .update({
      title: updates.title,
      description: updates.description,
      category: updates.category,
      order_index: updates.orderIndex,
      is_active: updates.isActive,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteVideoTutorial(id) {
  const { error } = await supabase
    .from('video_tutorials')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

export async function incrementViewCount(id) {
  await supabase
    .from('video_tutorials')
    .update({ views_count: supabase.raw('views_count + 1') })
    .eq('id', id);
}

export function getVideoCategories() {
  return [
    { id: 'visa', name: 'Visa Applications', icon: 'passport' },
    { id: 'booking', name: 'Booking Process', icon: 'ticket' },
    { id: 'payment', name: 'Payments', icon: 'credit-card' },
    { id: 'account', name: 'Account Management', icon: 'user' },
    { id: 'faq', name: 'FAQ', icon: 'help-circle' }
  ];
}