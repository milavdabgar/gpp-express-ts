import express from 'express';
import * as departmentController from '../controllers/department.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Restrict all routes to admin and principal
router.use(restrictTo('admin', 'principal'));

router
  .route('/')
  .get(departmentController.getAllDepartments)
  .post(departmentController.createDepartment);

router
  .route('/stats')
  .get(departmentController.getDepartmentStats);

router
  .route('/:id')
  .get(departmentController.getDepartment)
  .patch(departmentController.updateDepartment)
  .delete(departmentController.deleteDepartment);

export default router;
