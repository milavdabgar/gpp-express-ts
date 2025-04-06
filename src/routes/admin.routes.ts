import express from 'express';
import multer from 'multer';
import {
  createUser,
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
  importUsers,
  exportUsers,
  assignRoles
} from '../controllers/admin.controller';

import {
  getAllRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  importRoles,
  exportRoles
} from '../controllers/role.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protect all routes
router.use(protect);
router.use(restrictTo('admin'));

// User Management
router.post('/users', createUser);
router.get('/users', getAllUsers);
router.get('/users/export', exportUsers);
router.get('/users/:id', getUser);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// CSV Import/Export
router.post('/users/import', upload.single('file'), importUsers);

// Role Management
router.get('/roles', getAllRoles);
router.post('/roles', createRole);
router.get('/roles/export', exportRoles);
router.post('/roles/import', upload.single('file'), importRoles);
router.get('/roles/:id', getRole);
router.patch('/roles/:id', updateRole);
router.delete('/roles/:id', deleteRole);

// User Role Assignment
router.patch('/users/:id/roles', assignRoles);

export default router;
