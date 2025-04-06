import express from 'express';
import multer from 'multer';
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

// Protect all routes after this middleware
router.use(protect);
router.use(restrictTo('admin'));

router.route('/')
  .get(getAllRoles)
  .post(createRole);

router.route('/import')
  .post(upload.single('file'), importRoles);

router.route('/export')
  .get(exportRoles);

router.route('/:id')
  .get(getRole)
  .patch(updateRole)
  .delete(deleteRole);

export default router;
