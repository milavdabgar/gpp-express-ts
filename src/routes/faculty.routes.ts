import express from 'express';
import {
  createFaculty,
  getAllFaculty,
  getFaculty,
  updateFaculty,
  deleteFaculty,
  getFacultyByDepartment,
  exportFacultyCsv,
  uploadFacultyCsv
} from '../controllers/faculty.controller';
import multer from 'multer';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Routes restricted to admin and principal
router.use(restrictTo('admin', 'principal'));

// Configure multer for CSV upload
const upload = multer();

router.get('/export-csv', exportFacultyCsv);
router.post('/upload-csv', upload.single('file'), uploadFacultyCsv);

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
