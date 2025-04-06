import { Request, Response } from 'express';
import { FacultyModel } from '../models/faculty.model';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';
import csv from 'csv-parse';
import { stringify } from 'csv-stringify';
import { Readable } from 'stream';

// Export faculty to CSV
export const exportFacultyCsv = catchAsync(async (_req: Request, res: Response) => {
  const faculty = await FacultyModel.find()
    .populate({
      path: 'userId',
      select: 'name email'
    })
    .populate({
      path: 'departmentId',
      select: 'name'
    });
  
  const csvData = faculty.map(f => ({
    name: (f.userId as any)?.name || '',
    email: (f.userId as any)?.email || '',
    employeeId: f.employeeId,
    department: (f.departmentId as any)?.name || '',
    designation: f.designation,
    specializations: f.specializations.join(','),
    qualifications: f.qualifications.map(q => q.degree).join(','),
    field: f.qualifications[0]?.field || '',
    institution: f.qualifications[0]?.institution || '',
    year: f.qualifications[0]?.year || '',
    joiningDate: f.joiningDate.toISOString().split('T')[0],
    experienceYears: f.experience.years,
    experienceDetails: f.experience.details
  }));

  const stringifier = stringify({
    header: true,
    columns: [
      'name', 'email', 'employeeId', 'department', 'designation',
      'specializations', 'qualifications', 'field', 'institution',
      'year', 'joiningDate', 'experienceYears', 'experienceDetails'
    ]
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=faculty.csv');

  stringifier.pipe(res);
  csvData.forEach(row => stringifier.write(row));
  stringifier.end();
});

// Helper function to create a user
async function createUser(name: string, email: string, departmentId: string) {
  const password = Math.random().toString(36).slice(-8); // Generate random password
  const user = await UserModel.create({
    name,
    email,
    password,
    roles: ['faculty'],
    department: departmentId
  });
  return { user, password };
}

// Upload faculty from CSV
export const uploadFacultyCsv = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Please upload a CSV file', 400);
  }

  const results: any[] = [];
  const parser = csv.parse({
    columns: true,
    skip_empty_lines: true
  });

  const stream = Readable.from(req.file.buffer.toString());
  stream.pipe(parser);

  for await (const row of parser) {
    try {
      // Find or create department
      let department = await DepartmentModel.findOne({ name: row.department });
      if (!department) {
        throw new AppError(`Department ${row.department} not found`, 400);
      }

      // Create user
      const { user, password } = await createUser(row.name, row.email, department._id);

      // Create faculty
      const faculty = await FacultyModel.create({
        userId: user._id,
        departmentId: department._id,
        employeeId: row.employeeId,
        designation: row.designation,
        specializations: row.specializations?.split(',').map((s: string) => s.trim()) || [],
        qualifications: row.qualifications?.split(',').map((q: string) => ({
          degree: q.trim(),
          field: row.field || '',
          institution: row.institution || '',
          year: parseInt(row.year) || new Date().getFullYear()
        })) || [],
        joiningDate: row.joiningDate || new Date(),
        status: 'active',
        experience: {
          years: parseInt(row.experienceYears) || 0,
          details: row.experienceDetails || ''
        }
      });

      results.push({
        name: user.name,
        email: user.email,
        password,
        employeeId: faculty.employeeId
      });
    } catch (error: any) {
      results.push({
        error: error.message,
        row
      });
    }
  }

  res.status(200).json({
    status: 'success',
    data: { results }
  });
});

// Create faculty
export const createFaculty = catchAsync(async (req: Request, res: Response) => {
  // Check if user exists and has faculty role
  const user = await UserModel.findById(req.body.userId);
  if (!user) {
    throw new AppError('No user found with that ID', 404);
  }
  if (!user.roles.includes('faculty')) {
    throw new AppError('User must have faculty role', 400);
  }

  // Check if department exists
  const department = await DepartmentModel.findById(req.body.departmentId);
  if (!department) {
    throw new AppError('No department found with that ID', 404);
  }

  // Create faculty
  const faculty = await FacultyModel.create(req.body);

  res.status(201).json({
    status: 'success',
    data: { faculty }
  });
});

// Get all faculty members
export const getAllFaculty = catchAsync(async (_: Request, res: Response) => {
  const faculty = await FacultyModel.find()
    .populate('userId', 'name email')
    .populate('departmentId', 'name');

  res.status(200).json({
    status: 'success',
    data: { faculty }
  });
});

// Get single faculty member
export const getFaculty = catchAsync(async (req: Request, res: Response) => {
  const faculty = await FacultyModel.findById(req.params.id)
    .populate('userId', 'name email')
    .populate('departmentId', 'name');

  if (!faculty) {
    throw new AppError('No faculty found with that ID', 404);
  }

  res.status(200).json({
    status: 'success',
    data: { faculty }
  });
});

// Update faculty
export const updateFaculty = catchAsync(async (req: Request, res: Response) => {
  // If updating department, check if it exists
  if (req.body.departmentId) {
    const department = await DepartmentModel.findById(req.body.departmentId);
    if (!department) {
      throw new AppError('No department found with that ID', 404);
    }
  }

  const faculty = await FacultyModel.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  ).populate('userId', 'name email')
   .populate('departmentId', 'name');

  if (!faculty) {
    throw new AppError('No faculty found with that ID', 404);
  }

  res.status(200).json({
    status: 'success',
    data: { faculty }
  });
});

// Delete faculty
export const deleteFaculty = catchAsync(async (req: Request, res: Response) => {
  const faculty = await FacultyModel.findByIdAndDelete(req.params.id);

  if (!faculty) {
    throw new AppError('No faculty found with that ID', 404);
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get faculty by department
export const getFacultyByDepartment = catchAsync(async (req: Request, res: Response) => {
  const faculty = await FacultyModel.find({ departmentId: req.params.departmentId })
    .populate('userId', 'name email')
    .populate('departmentId', 'name');

  res.status(200).json({
    status: 'success',
    data: { faculty }
  });
});
