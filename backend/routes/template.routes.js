import express from 'express';
import { 
  getTemplates, 
  getTemplateById, 
  createTemplate, 
  updateTemplate, 
  deleteTemplate,
  sendTemplateResponse 
} from '../services/templateResponse.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const templates = await getTemplates(category);
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('[Templates] Get error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const template = await getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('[Templates] GetById error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const template = await createTemplate({
      ...req.body,
      createdBy: req.user?.id
    });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('[Templates] Create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const template = await updateTemplate(req.params.id, req.body);
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('[Templates] Update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteTemplate(req.params.id);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('[Templates] Delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { inquiryId, templateKey, variables } = req.body;
    if (!inquiryId || !templateKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'inquiryId and templateKey are required' 
      });
    }
    
    const result = await sendTemplateResponse(inquiryId, templateKey, variables);
    res.json(result);
  } catch (error) {
    console.error('[Templates] Send error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;