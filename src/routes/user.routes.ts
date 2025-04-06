import express from 'express';
import { getMe, updateMe } from '../controllers/user.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

router.get('/me', getMe);
router.patch('/updateMe', updateMe);

export default router;
