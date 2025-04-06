import express from 'express';
import multer from 'multer';
import {
  getAllStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentsByDepartment,
  uploadStudentsCsv,
  exportStudentsCsv,
  syncStudentUsers
} from '../controllers/student.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protect all routes after this middleware
router.use(protect);

// Routes restricted to admin, principal, and hod
router.use(restrictTo('admin', 'principal', 'hod'));

// Student sync endpoint
router.post('/sync', syncStudentUsers);

// CSV import/export endpoints
router.get('/export-csv', exportStudentsCsv);
router.post('/upload-csv', upload.single('file'), uploadStudentsCsv);

// CRUD endpoints
router.route('/')
  .get(getAllStudents)
  .post(createStudent);

router.route('/:id')
  .get(getStudent)
  .patch(updateStudent)
  .delete(deleteStudent);

// Department specific endpoints
router.get('/department/:departmentId', getStudentsByDepartment);

export default router;