import express from 'express';
import multer from 'multer';
import {
  getAllResults,
  getResult,
  getStudentResults,
  getUploadBatches,
  deleteResult,
  deleteResultsByBatch,
  importResults,
  exportResults,
  getBranchAnalysis
} from '../controllers/result.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Configure multer for CSV upload
const upload = multer({ storage: multer.memoryStorage() });

// Protect all routes
router.use(protect);

// Routes for admin
router.route('/')
  .get(restrictTo('admin', 'principal', 'hod'), getAllResults);

router.route('/batches')
  .get(restrictTo('admin'), getUploadBatches);

router.route('/export')
  .get(restrictTo('admin', 'principal', 'hod'), exportResults);

router.route('/import')
  .post(restrictTo('admin'), upload.single('file'), importResults);

router.route('/analysis/branch')
  .get(restrictTo('admin', 'principal', 'hod', 'faculty'), getBranchAnalysis);

router.route('/student/:studentId')
  .get(restrictTo('admin', 'principal', 'hod', 'faculty', 'student'), getStudentResults);

router.route('/:id')
  .get(restrictTo('admin', 'principal', 'hod', 'faculty'), getResult)
  .delete(restrictTo('admin'), deleteResult);

router.route('/batch/:batchId')
  .delete(restrictTo('admin'), deleteResultsByBatch);

export default router;
