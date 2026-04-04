import express from 'express';
import { 
  getDocumentTemplates, 
  getDocumentTemplateById, 
  createDocumentTemplate, 
  updateDocumentTemplate, 
  deleteDocumentTemplate,
  incrementDownloadCount 
} from '../services/documentTemplate.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const templates = await getDocumentTemplates(category);
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('[Documents] Get error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const template = await getDocumentTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('[Documents] GetById error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const template = await createDocumentTemplate({
      ...req.body,
      createdBy: req.user?.id
    });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('[Documents] Create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const template = await updateDocumentTemplate(req.params.id, req.body);
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('[Documents] Update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteDocumentTemplate(req.params.id);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('[Documents] Delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/download', async (req, res) => {
  try {
    await incrementDownloadCount(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Documents] Download count error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;