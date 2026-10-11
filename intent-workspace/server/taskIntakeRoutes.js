import { Router } from 'express';
import { analyzeTaskIntake } from './taskIntake.js';

const router = Router();
router.post('/api/tasks/intake', async (req, res, next) => {
  try {
    res.json(await analyzeTaskIntake(req.body));
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    next(error);
  }
});
export default router;
