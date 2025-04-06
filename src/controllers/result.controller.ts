import { Request, Response } from 'express';
import { ResultModel } from '../models/result.model';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../middleware/error.middleware';
import csv from 'csv-parser';
import { Parser } from 'json2csv';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

// Get all results with filtering options
export const getAllResults = catchAsync(async (req: Request, res: Response) => {
  const {
    branchName,
    semester,
    academicYear,
    examid,
    uploadBatch
  } = req.query;

  // Build query based on provided filters
  const query: any = {};
  
  if (branchName) query.branchName = branchName;
  if (semester) query.semester = Number(semester);
  if (academicYear) query.academicYear = academicYear;
  if (examid) query.examid = Number(examid);
  if (uploadBatch) query.uploadBatch = uploadBatch;

  // Pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const skip = (page - 1) * limit;

  // Execute query with pagination
  const results = await ResultModel.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count for pagination
  const total = await ResultModel.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      results,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Get result by ID
export const getResult = catchAsync(async (req: Request, res: Response) => {
  const result = await ResultModel.findById(req.params.id);
  
  if (!result) {
    throw new AppError('Result not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      result
    }
  });
});

// Get results by student ID
export const getStudentResults = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  
  const results = await ResultModel.find({ st_id: studentId })
    .sort({ semester: 1, examid: 1 });
  
  res.status(200).json({
    status: 'success',
    data: {
      results
    }
  });
});

// Get recent upload batches
export const getUploadBatches = catchAsync(async (_req: Request, res: Response) => {
  const batches = await ResultModel.aggregate([
    {
      $group: {
        _id: '$uploadBatch',
        count: { $sum: 1 },
        latestUpload: { $max: '$createdAt' }
      }
    },
    {
      $sort: { latestUpload: -1 }
    },
    {
      $limit: 20
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: {
      batches
    }
  });
});

// Delete a result by ID
export const deleteResult = catchAsync(async (req: Request, res: Response) => {
  const result = await ResultModel.findByIdAndDelete(req.params.id);
  
  if (!result) {
    throw new AppError('Result not found', 404);
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Delete results by upload batch
export const deleteResultsByBatch = catchAsync(async (req: Request, res: Response) => {
  const { batchId } = req.params;
  
  const deleteResult = await ResultModel.deleteMany({ uploadBatch: batchId });
  
  if (deleteResult.deletedCount === 0) {
    throw new AppError('No results found for this batch', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      deletedCount: deleteResult.deletedCount
    }
  });
});

// Process GTU result CSV format
const processGtuResultCsv = (rows: any[]) => {
  return rows.map(row => {
    // Extract subjects
    const subjects = [];
    
    // Process up to 15 subjects (based on sample CSV structure)
    for (let i = 1; i <= 15; i++) {
      const subCode = row[`SUB${i}`];
      const subName = row[`SUB${i}NA`];
      
      // Skip empty subjects
      if (!subCode || !subName) continue;
      
      const credits = parseInt(row[`SUB${i}CR`]) || 0;
      const grade = row[`SUB${i}GR`] || '';
      const isBacklog = row[`BCK${i}`] === 1;
      
      subjects.push({
        code: subCode,
        name: subName,
        credits,
        grade,
        isBacklog
      });
    }

    // Create formatted result object
    return {
      st_id: row.St_Id,
      extype: row.extype,
      examid: parseInt(row.examid) || 0,
      exam: row.exam,
      declarationDate: new Date(row.DECLARATIONDATE || Date.now()),
      academicYear: row.AcademicYear,
      semester: parseInt(row.sem) || 0,
      mapNumber: parseFloat(row.MAP_NUMBER) || 0,
      unitNo: parseFloat(row.UNIT_NO) || 0,
      examNumber: parseFloat(row.EXAMNUMBER) || 0,
      name: row.name,
      instcode: parseInt(row.instcode) || 0,
      instName: row.instName,
      courseName: row.CourseName,
      branchCode: parseInt(row.BR_CODE) || 0,
      branchName: row.BR_NAME,
      subjects,
      totalCredits: parseInt(row.SPI_TOTCR) || 0,
      earnedCredits: parseInt(row.SPI_ERTOTCR) || 0,
      spi: parseFloat(row.SPI) || 0,
      cpi: parseFloat(row.CPI) || 0,
      cgpa: parseFloat(row.CGPA) || 0,
      result: row.RESULT,
      trials: parseInt(row.TRIAL) || 1,
      remark: row.REMARK
    };
  });
};

// Import results from CSV
export const importResults = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Please upload a CSV file', 400);
  }

  const results: any[] = [];
  const stream = Readable.from(req.file.buffer.toString());
  
  try {
    // Parse CSV data
    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve())
        .on('error', (error) => reject(error));
    });

    // Generate a unique batch ID for this upload
    const batchId = uuidv4();
    
    // Process the CSV data
    const processedResults = processGtuResultCsv(results);

    // Add batch ID to each result
    const resultsWithBatch = processedResults.map(result => ({
      ...result,
      uploadBatch: batchId
    }));

    // Save to database
    const savedResults = await ResultModel.insertMany(resultsWithBatch, {
      ordered: false // Continue inserting even if some fail (due to duplicates)
    }).then(docs => ({
      insertedCount: docs.length,
      error: undefined
    })).catch((error: any) => {
      // Check if it's a duplicate key error
      if (error.code === 11000) {
        return {
          insertedCount: error.result?.insertedCount || 0,
          error: 'Some results were not imported due to duplicates'
        };
      }
      throw error;
    });

    res.status(201).json({
      status: 'success',
      data: {
        batchId,
        importedCount: savedResults.insertedCount || processedResults.length,
        totalRows: results.length
      }
    });
  } catch (error) {
    throw new AppError(`Error processing CSV: ${error.message}`, 400);
  }
});

// Export results to CSV
export const exportResults = catchAsync(async (req: Request, res: Response) => {
  const {
    branchName,
    semester,
    academicYear,
    examid,
    uploadBatch
  } = req.query;

  // Build query based on provided filters
  const query: any = {};
  
  if (branchName) query.branchName = branchName;
  if (semester) query.semester = Number(semester);
  if (academicYear) query.academicYear = academicYear;
  if (examid) query.examid = Number(examid);
  if (uploadBatch) query.uploadBatch = uploadBatch;

  // Get results from database
  const results = await ResultModel.find(query);

  // Prepare data for CSV export
  const csvData = results.map(result => {
    // Convert subjects back to the flat structure for CSV
    const flatResult: any = {
      St_Id: result.st_id,
      extype: result.extype,
      examid: result.examid,
      exam: result.exam,
      DECLARATIONDATE: result.declarationDate ? result.declarationDate.toISOString().split('T')[0] : '',
      AcademicYear: result.academicYear,
      sem: result.semester,
      name: result.name,
      instcode: result.instcode,
      instName: result.instName,
      BR_NAME: result.branchName,
      BR_CODE: result.branchCode,
      SPI: result.spi,
      CPI: result.cpi,
      CGPA: result.cgpa,
      RESULT: result.result,
      TRIAL: result.trials,
      REMARK: result.remark,
      uploadBatch: result.uploadBatch
    };

    // Add subjects to flat structure
    result.subjects.forEach((subject, index) => {
      const i = index + 1;
      flatResult[`SUB${i}`] = subject.code;
      flatResult[`SUB${i}NA`] = subject.name;
      flatResult[`SUB${i}CR`] = subject.credits;
      flatResult[`SUB${i}GR`] = subject.grade;
      flatResult[`BCK${i}`] = subject.isBacklog ? 1 : 0;
    });

    return flatResult;
  });

  // Generate CSV
  const parser = new Parser({ 
    fields: Object.keys(csvData[0] || {})
  });
  const csv = parser.parse(csvData);

  // Set headers for file download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=results.csv');
  
  res.status(200).send(csv);
});

// Get branch-wise analysis
export const getBranchAnalysis = catchAsync(async (req: Request, res: Response) => {
  const { academicYear, examid } = req.query;
  
  const query: any = {};
  if (academicYear) query.academicYear = academicYear;
  if (examid) query.examid = Number(examid);
  
  const analysis = await ResultModel.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          branchName: '$branchName',
          semester: '$semester'
        },
        totalStudents: { $sum: 1 },
        passCount: {
          $sum: {
            $cond: [{ $eq: ['$result', 'PASS'] }, 1, 0]
          }
        },
        distinctionCount: {
          $sum: {
            $cond: [{ $gte: ['$spi', 8.5] }, 1, 0]
          }
        },
        firstClassCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$spi', 7.0] },
                  { $lt: ['$spi', 8.5] }
                ]
              },
              1,
              0
            ]
          }
        },
        secondClassCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$spi', 6.0] },
                  { $lt: ['$spi', 7.0] }
                ]
              },
              1,
              0
            ]
          }
        },
        avgSpi: { $avg: '$spi' },
        avgCpi: { $avg: '$cpi' }
      }
    },
    {
      $addFields: {
        passPercentage: { 
          $multiply: [
            { $divide: ['$passCount', '$totalStudents'] },
            100
          ]
        }
      }
    },
    {
      $sort: {
        '_id.branchName': 1,
        '_id.semester': 1
      }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: {
      analysis
    }
  });
});
