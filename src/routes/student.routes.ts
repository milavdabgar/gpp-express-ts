import { Router } from 'express';
import multer from 'multer';
import * as studentController from '../controllers/student.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.route('/')
  .get(studentController.getAllStudents)
  .post(studentController.createStudent);

router.route('/sync')
  .post(studentController.syncStudentUsers);

router.route('/export-csv')
  .get(studentController.exportStudentsCsv);

router.route('/upload-csv')
  .post(upload.single('file'), studentController.importGTUStudents);

router.route('/:id')
  .get(studentController.getStudent)
  .patch(studentController.updateStudent)
  .delete(studentController.deleteStudent);

export default router;