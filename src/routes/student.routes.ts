import express from 'express';
import multer from 'multer';
import {
  getAllStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  uploadStudentsCsv
} from '../controllers/student.controller';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.route('/')
  .get(getAllStudents)
  .post(createStudent);

router.route('/upload-csv')
  .post(upload.single('file'), uploadStudentsCsv);

router.route('/:id')
  .patch(updateStudent)
  .delete(deleteStudent);

export default router;
