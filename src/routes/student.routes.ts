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
  exportStudentsCsv
} from '../controllers/student.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protect all routes after this middleware
router.use(protect);

// Routes restricted to admin, principal, and hod
router.use(restrictTo('admin', 'principal', 'hod'));

router.get('/export-csv', exportStudentsCsv);
router.post('/upload-csv', upload.single('file'), uploadStudentsCsv);

router.route('/')
  .get(getAllStudents)
  .post(createStudent);

router.route('/:id')
  .get(getStudent)
  .patch(updateStudent)
  .delete(deleteStudent);

router.route('/department/:departmentId')
  .get(getStudentsByDepartment);

export default router;