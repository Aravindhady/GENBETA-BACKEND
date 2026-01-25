import express from 'express';
import { uploadImage } from '../services/cloudinary.service.js';

const router = express.Router();

router.post('/signature', async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'Base64 string is required' });
    }

    const result = await uploadImage(base64, 'signatures');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/image', async (req, res) => {
  try {
    const { base64, folder = 'uploads' } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'Base64 string is required' });
    }

    const result = await uploadImage(base64, folder);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
