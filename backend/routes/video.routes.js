import express from 'express';
import { 
  getVideoTutorials, 
  getVideoTutorialById, 
  createVideoTutorial, 
  updateVideoTutorial, 
  deleteVideoTutorial,
  incrementViewCount 
} from '../services/videoTutorials.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { category, language } = req.query;
    const tutorials = await getVideoTutorials(category, language);
    res.json({ success: true, data: tutorials });
  } catch (error) {
    console.error('[Videos] Get error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tutorial = await getVideoTutorialById(req.params.id);
    if (!tutorial) {
      return res.status(404).json({ success: false, message: 'Tutorial not found' });
    }
    res.json({ success: true, data: tutorial });
  } catch (error) {
    console.error('[Videos] GetById error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const tutorial = await createVideoTutorial(req.body);
    res.status(201).json({ success: true, data: tutorial });
  } catch (error) {
    console.error('[Videos] Create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const tutorial = await updateVideoTutorial(req.params.id, req.body);
    res.json({ success: true, data: tutorial });
  } catch (error) {
    console.error('[Videos] Update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteVideoTutorial(req.params.id);
    res.json({ success: true, message: 'Tutorial deleted' });
  } catch (error) {
    console.error('[Videos] Delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/view', async (req, res) => {
  try {
    await incrementViewCount(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Videos] View count error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;