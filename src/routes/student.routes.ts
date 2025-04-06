import express from 'express';
import multer from 'multer';
import {
  getAllStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  uploadStudentsCsv,
  exportStudentsCsv
} from '../controllers/student.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protect all routes after this middleware
router.use(protect);

// Routes restricted to admin and principal
router.use(restrictTo('admin', 'principal'));

router.get('/export-csv', exportStudentsCsv);
router.post('/upload-csv', upload.single('file'), uploadStudentsCsv);

router.route('/')
  .get(getAllStudents)
  .post(createStudent);

router.route('/:id')
  .patch(updateStudent)
  .delete(deleteStudent);

export default router;
