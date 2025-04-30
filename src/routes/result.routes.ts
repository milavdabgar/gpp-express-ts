import { Router } from 'express';
import * as resultController from '../controllers/result.controller';
import multer from 'multer';
import { protect } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protect all routes
router.use(protect);

router.route('/')
  .get(resultController.getAllResults);

router.route('/import')
  .post(upload.single('file'), resultController.importResults);

router.route('/export')
  .get(resultController.exportResults);

router.route('/analysis')
  .get(resultController.getBranchAnalysis);

router.route('/batches')
  .get(resultController.getUploadBatches);

router.route('/batch/:batchId')
  .delete(resultController.deleteResultsByBatch);

// Update this route to use enrollmentNo
router.route('/student/:enrollmentNo')
  .get(resultController.getStudentResults);

router.route('/:id')
  .get(resultController.getResult)
  .delete(resultController.deleteResult);

export default router;
