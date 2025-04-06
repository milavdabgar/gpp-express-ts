import express from 'express';
import {
  createFaculty,
  getAllFaculty,
  getFaculty,
  updateFaculty,
  deleteFaculty,
  getFacultyByDepartment
} from '../controllers/faculty.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Routes restricted to admin and principal
router.use(restrictTo('admin', 'principal'));

router
  .route('/')
  .get(getAllFaculty)
  .post(createFaculty);

router
  .route('/:id')
  .get(getFaculty)
  .patch(updateFaculty)
  .delete(deleteFaculty);

router
  .route('/department/:departmentId')
  .get(getFacultyByDepartment);

export default router;
