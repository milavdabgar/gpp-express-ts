import express from 'express';
import multer from 'multer';
import {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
  importUsers,
  exportUsers,
  getRoles,
  assignRoles
} from '../controllers/admin.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protect all routes
router.use(protect);
router.use(restrictTo('admin'));

// User Management
router.get('/users', getAllUsers);
router.get('/users/export', exportUsers);
router.get('/users/:id', getUser);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// CSV Import/Export
router.post('/users/import', upload.single('file'), importUsers);

// Role Management
router.get('/roles', getRoles);
router.patch('/users/:id/roles', assignRoles);

export default router;
