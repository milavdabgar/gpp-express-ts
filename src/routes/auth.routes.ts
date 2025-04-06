import express from 'express';
import { signup, login, switchRole } from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/switch-role', protect, switchRole);

export default router;
