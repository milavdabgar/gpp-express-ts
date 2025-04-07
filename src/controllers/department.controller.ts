import { Request, Response } from 'express';
import { DepartmentModel } from '../models/department.model';
import { UserModel } from '../models/user.model';
import { AppError } from '../middleware/error.middleware';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { createObjectCsvWriter } from 'csv-writer';
import { catchAsync } from '../utils/async.utils';

// Get all departments
export const getAllDepartments = catchAsync(async (_req: Request, res: Response) => {
  const departments = await DepartmentModel.find()
    .populate('hodId', 'name email')
    .sort({ name: 1 });

  res.status(200).json({
    status: 'success',
    data: {
      departments
    }
  });
});

// Get single department
export const getDepartment = catchAsync(async (req: Request, res: Response) => {
  const department = await DepartmentModel.findById(req.params.id)
    .populate('hodId', 'name email');

  if (!department) {
    throw new AppError('No department found with that ID', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      department
    }
  });
});

// Create department
export const createDepartment = catchAsync(async (req: Request, res: Response) => {
  // If hodId is provided, verify that user exists and has appropriate role
  if (req.body.hodId) {
    const user = await UserModel.findById(req.body.hodId);
    if (!user) {
      throw new AppError('No user found with that ID', 404);
    }
    // Ensure user has HOD role - you may want to customize this based on your role system
    if (!user.roles.includes('hod')) {
      throw new AppError('User must have HOD role to be assigned as department head', 400);
    }
  }

  const department = await DepartmentModel.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      department
    }
  });
});

// Update department
export const updateDepartment = catchAsync(async (req: Request, res: Response) => {
  // If hodId is being updated and not empty, verify that user exists and has appropriate role
  if (req.body.hodId && req.body.hodId.trim() !== '') {
    const user = await UserModel.findById(req.body.hodId);
    if (!user) {
      throw new AppError('No user found with that ID', 404);
    }
    // Ensure user has HOD role
    if (!user.roles.includes('hod')) {
      throw new AppError('User must have HOD role to be assigned as department head', 400);
    }
  } else if (req.body.hodId === '') {
    // If hodId is empty string, set it to null
    req.body.hodId = null;
  }

  const department = await DepartmentModel.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  ).populate('hodId', 'name email');

  if (!department) {
    throw new AppError('No department found with that ID', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      department
    }
  });
});

// Delete department
export const deleteDepartment = catchAsync(async (req: Request, res: Response) => {
  const department = await DepartmentModel.findByIdAndDelete(req.params.id);

  if (!department) {
    throw new AppError('No department found with that ID', 404);
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get department statistics
export const getDepartmentStats = catchAsync(async (_req: Request, res: Response) => {
  const stats = await DepartmentModel.aggregate([
    {
      $group: {
        _id: '$isActive',
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats
    }
  });
});

// Import departments from CSV
export const importDepartments = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Please upload a CSV file', 400);
  }

  interface ImportedDepartment {
    name: string;
    code: string;
    description: string;
    establishedDate: string;
    isActive: boolean;
  }

  const departments: ImportedDepartment[] = [];
  const fileContent = req.file.buffer.toString();

  const stream = Readable.from(fileContent);
  let isFirstRow = true;

  await new Promise((resolve, reject) => {
    stream
      .pipe(csv({
        mapHeaders: ({ header }: { header: string }) => header.toLowerCase().trim(),
        mapValues: ({ value }: { value: string }) => value.trim()
      }))
      .on('data', (data: any) => {
        // Skip header row
        if (isFirstRow) {
          isFirstRow = false;
          return;
        }

        // Validate required fields
        if (!data.name || !data.code || !data.description || !data.establisheddate) {
          console.log('Missing required fields in row:', data);
          return; // Skip invalid rows
        }

        // Prepare department data
        const department: ImportedDepartment = {
          name: data.name,
          code: data.code.toUpperCase(),
          description: data.description,
          establishedDate: new Date(data.establisheddate).toISOString(),
          isActive: data.isactive?.toLowerCase() === 'true' || data.isactive === '1' || true
        };

        departments.push(department);
      })
      .on('end', () => resolve(null))
      .on('error', (error) => reject(error));
  });

  if (departments.length === 0) {
    throw new AppError('No valid departments found in CSV', 400);
  }

  // Handle each department individually to support upserts
  const results = await Promise.all(
    departments.map(async (department) => {
      try {
        // Try to update existing department, if not found create new one
        const result = await DepartmentModel.findOneAndUpdate(
          { code: department.code },
          { 
            $set: {
              name: department.name,
              description: department.description,
              establishedDate: department.establishedDate,
              isActive: department.isActive
            }
          },
          { upsert: true, new: true }
        );
        return { status: 'success', department: result };
      } catch (error: any) {
        return { status: 'error', error: error.message, department };
      }
    })
  );

  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'error');

  res.status(200).json({
    status: 'success',
    message: `${successful.length} departments processed (${failed.length} failed)`,
    data: {
      successful: successful.map(r => r.department),
      failed: failed.map(r => ({ department: r.department, error: r.error }))
    }
  });
});

// Export departments to CSV
export const exportDepartments = catchAsync(async (_req: Request, res: Response) => {
  const departments = await DepartmentModel.find();

  const csvWriter = createObjectCsvWriter({
    path: 'departments.csv',
    header: [
      { id: 'name', title: 'Name' },
      { id: 'code', title: 'Code' },
      { id: 'description', title: 'Description' },
      { id: 'establishedDate', title: 'EstablishedDate' },
      { id: 'isActive', title: 'IsActive' }
    ]
  });

  await csvWriter.writeRecords(departments.map(dept => ({
    name: dept.name,
    code: dept.code,
    description: dept.description,
    establishedDate: dept.establishedDate.toISOString().split('T')[0],
    isActive: dept.isActive
  })));

  res.download('departments.csv');
});
