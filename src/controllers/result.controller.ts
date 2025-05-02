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

// Get results by student enrollment number
export const getStudentResults = catchAsync(async (req: Request, res: Response) => {
  const { enrollmentNo } = req.params;
  
  const results = await ResultModel.find({ enrollmentNo })
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

// Helper to extract enrollment number - use MAP_NUMBER if available, otherwise extract from St_Id
const extractEnrollmentNo = (row: any): string => {
  // Prioritize MAP_NUMBER as it's more meaningful, fall back to St_Id if not available
  return row.MAP_NUMBER || row.St_Id || '';
};

// Helper to extract St_Id - ensure we always have a value for this field
const extractStId = (row: any): string => {
  // Use St_Id if available, otherwise use MAP_NUMBER
  return row.St_Id || row.MAP_NUMBER || '';
};

// Process GTU result CSV format
const processGtuResultCsv = (rows: any[]) => {
  return rows.map(row => {
    const subjects = [];
    
    // Find subject columns by checking for SUB pattern
    const subjectColumns = Object.keys(row).filter(key => key.match(/^SUB\d+$/));
    const maxSubjects = subjectColumns.length;

    // Process subjects dynamically based on available columns
    for (let i = 1; i <= maxSubjects; i++) {
      const subCode = row[`SUB${i}`];
      const subName = row[`SUB${i}NA`];
      
      // Skip empty subjects
      if (!subCode || !subName) continue;
      
      const credits = parseFloat(row[`SUB${i}CR`]) || 0;
      const grade = row[`SUB${i}GR`] || '';
      
      // Extract individual grade components based on CSV documentation
      const theoryEseGrade = row[`SUB${i}GRE`] || '';      // Theory External (E) - 70 marks
      const theoryPaGrade = row[`SUB${i}GRM`] || '';      // Theory Mid-term/PA (M) - 30 marks
      const theoryTotalGrade = row[`SUB${i}GRTH`] || '';  // Theory Total (E+M = 100 marks)
      const practicalPaGrade = row[`SUB${i}GRI`] || '';   // Practical Internal/PA (I) - 20 marks
      const practicalVivaGrade = row[`SUB${i}GRV`] || ''; // Practical End Term Viva (V) - 30 marks
      const practicalTotalGrade = row[`SUB${i}GRPR`] || ''; // Practical Total (I+V = 50 marks)
      
      // Mark as backlog if grade is FF
      const isBacklog = grade === 'FF';

      subjects.push({
        code: subCode,
        name: subName,
        credits,
        grade,
        isBacklog,
        theoryEseGrade,    // External (70 marks)
        theoryPaGrade,     // Mid-term/PA (30 marks)
        theoryTotalGrade,  // Total theory (100 marks)
        practicalPaGrade,  // Internal/PA (20 marks)
        practicalVivaGrade, // End Term Viva (30 marks)
        practicalTotalGrade // Total practical (50 marks)
      });
    }

    // Get enrollment number and st_id using the helper functions
    const enrollmentNo = extractEnrollmentNo(row);
    const st_id = extractStId(row);

    // Create formatted result object
    return {
      st_id,
      enrollmentNo,  // Use the extracted enrollment number
      extype: row.extype,
      examid: parseInt(row.examid) || 0,
      exam: row.exam,
      declarationDate: new Date(row.DECLARATIONDATE || Date.now()),
      academicYear: row.AcademicYear,
      semester: parseInt(row.sem) || 0,
      unitNo: parseFloat(row.UNIT_NO) || 0,
      examNumber: parseFloat(row.EXAMNUMBER) || 0,
      name: row.name,
      instcode: parseInt(row.instcode) || 0,
      instName: row.instName,
      courseName: row.CourseName,
      branchCode: parseInt(row.BR_CODE) || 0,
      branchName: row.BR_NAME,
      subjects,
      totalCredits: parseFloat(row.SPI_TOTCR) || 0,
      earnedCredits: parseFloat(row.SPI_ERTOTCR) || 0,
      spi: parseFloat(row.SPI) || 0,
      cpi: parseFloat(row.CPI) || 0,
      cgpa: parseFloat(row.CGPA) || 0,
      result: row.RESULT,
      trials: parseInt(row.TRIAL) || 1,
      remark: row.REMARK,
      currentBacklog: parseInt(row.CURBACKL) || 0,
      totalBacklog: parseInt(row.TOTBACKL) || 0
    };
  });
};

// Import results from CSV
export const importResults = catchAsync(async (req: Request, res: Response): Promise<any> => {
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

    if (results.length === 0) {
      throw new AppError('CSV file is empty', 400);
    }

    // Validate required columns exist
    const firstRow = results[0];
    const requiredColumns = ['extype', 'examid', 'sem', 'name', 'BR_NAME', 'CURBACKL', 'TOTBACKL'];
    // Add flexible ID column validation - can be either St_Id or MAP_NUMBER
    if (!('St_Id' in firstRow) && !('MAP_NUMBER' in firstRow)) {
      throw new AppError('Missing required column: Student ID (St_Id or MAP_NUMBER)', 400);
    }
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      throw new AppError(`Missing required columns: ${missingColumns.join(', ')}`, 400);
    }

    // Generate a unique batch ID for this upload
    const batchId = uuidv4();
    
    // Process the CSV data
    const processedResults = processGtuResultCsv(results);

    if (processedResults.length === 0) {
      throw new AppError('No valid results found after processing', 400);
    }

    // Add batch ID to each result
    const resultsWithBatch = processedResults.map(result => ({
      ...result,
      uploadBatch: batchId
    }));

    // Debug: Log the first result to see what's being processed
    console.log('Sample processed result:', {
      st_id: resultsWithBatch[0].st_id,
      enrollmentNo: resultsWithBatch[0].enrollmentNo,
      examid: resultsWithBatch[0].examid
    });

    // Check for existing results before attempting to insert
    // This helps provide better error messages
    const existingResults = await Promise.all(
      resultsWithBatch.slice(0, 5).map(async (result) => {
        const existing = await ResultModel.findOne({
          enrollmentNo: result.enrollmentNo,
          examid: result.examid
        });
        return existing ? result.enrollmentNo : null;
      })
    );

    const duplicateEnrollmentNos = existingResults.filter(Boolean);
    
    if (duplicateEnrollmentNos.length > 0) {
      // If we found duplicates in our sample check, provide a clear message
      return res.status(200).json({
        status: 'warning',
        data: {
          batchId: null,
          importedCount: 0,
          totalRows: results.length,
          error: `These results appear to have already been uploaded previously. Found duplicate enrollment numbers: ${duplicateEnrollmentNos.slice(0, 3).join(', ')}${duplicateEnrollmentNos.length > 3 ? '...' : ''}`
        }
      });
    }

    // Save to database
    try {
      const savedResults = await ResultModel.insertMany(resultsWithBatch, {
        ordered: false // Continue inserting even if some fail
      });

      res.status(201).json({
        status: 'success',
        data: {
          batchId,
          importedCount: savedResults.length,
          totalRows: results.length
        }
      });
      return;

    } catch (error: any) {
      console.error('Import error:', error);
      
      // Extract duplicate key information for better error messages
      let duplicateInfo = '';
      if (error.code === 11000 && error.writeErrors) {
        // Get the first few duplicate keys to show in the error message
        const duplicates = error.writeErrors
          .filter((e: any) => e.code === 11000)
          .slice(0, 3)
          .map((e: any) => {
            const keyValue = e.err?.keyValue || e.keyValue || {};
            return keyValue.enrollmentNo || 'unknown';
          });
          
        if (duplicates.length > 0) {
          duplicateInfo = ` Found duplicate enrollment numbers: ${duplicates.join(', ')}${error.writeErrors.length > 3 ? '...' : ''}`;
        }
      }
      
      // Check if this is actually a duplicate key error
      if (error.code === 11000) {
        const insertedCount = error.result?.nInserted || 0;
        
        res.status(200).json({
          status: 'partial',
          data: {
            batchId: insertedCount > 0 ? batchId : null,
            importedCount: insertedCount,
            totalRows: results.length,
            error: `Some or all results were not imported due to duplicates.${duplicateInfo}`
          }
        });
        return;
      }

      // For other database errors
      throw new AppError(error.message || 'Error saving results to database', 400);
    }

  } catch (error: any) {
    // Handle CSV processing errors
    throw new AppError(`Error processing CSV: ${error.message}`, 400);
  }
  
  // This return is to satisfy TypeScript - the function will either return earlier or throw an error
  return;
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
