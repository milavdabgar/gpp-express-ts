import { Request, Response } from 'express';
import { FacultyModel } from '../models/faculty.model';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';
import csv from 'csv-parse';
import { stringify } from 'csv-stringify';
import { Readable } from 'stream';
import bcrypt from 'bcryptjs';

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
  
  const csvData = faculty.map(f => {
    // Get all qualifications
    const qualifications = f.qualifications.map(q => 
      `${q.degree}|${q.field}|${q.institution}|${q.year}`
    ).join(';');

    return {
      'Employee ID': f.employeeId,
      'Name': (f.userId as any)?.name || '',
      'Email': (f.userId as any)?.email || '',
      'Department': (f.departmentId as any)?.name || '',
      'Designation': f.designation,
      'Status': f.status,
      'Joining Date': f.joiningDate.toISOString().split('T')[0],
      'Specializations': f.specializations.join('; '),
      // Qualifications (each entry: degree|field|institution|year)
      'Qualifications': qualifications,
      // Experience
      'Experience Years': f.experience.years,
      'Experience Details': f.experience.details,
      // Metadata
      'Created At': f.createdAt.toISOString().split('T')[0],
      'Last Updated': f.updatedAt.toISOString().split('T')[0]
    };
  });

  const stringifier = stringify({
    header: true,
    columns: [
      'Employee ID',
      'Name',
      'Email',
      'Department',
      'Designation',
      'Status',
      'Joining Date',
      'Specializations',
      'Qualifications',
      'Experience Years',
      'Experience Details',
      'Created At',
      'Last Updated'
    ]
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=faculty.csv');

  stringifier.pipe(res);
  csvData.forEach((row) => stringifier.write(row));
  stringifier.end();
});

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
      // Find department
      const department = await DepartmentModel.findOne({ name: row['Department'] });
      if (!department) {
        throw new AppError(`Department ${row['Department']} not found`, 400);
      }

      // Check if user exists with this email
      let user = await UserModel.findOne({ email: row['Email'] });
      if (!user && row['Email'] && row['Name']) {
        // Create new user only if email and name are provided
        const password = await bcrypt.hash('Student@123', 12);
        user = await UserModel.create({
          name: row['Name'],
          email: row['Email'],
          password,
          roles: ['faculty'],
          department: department._id
        });
      }

      if (!user) {
        throw new AppError('User email and name are required for new faculty members', 400);
      }

      // Parse qualifications
      const qualifications = row['Qualifications'].split(';').map((q: string) => {
        const [degree, field, institution, year] = q.split('|');
        return {
          degree: degree?.trim() || '',
          field: field?.trim() || '',
          institution: institution?.trim() || '',
          year: parseInt(year?.trim()) || new Date().getFullYear()
        };
      });

      // Create faculty
      const faculty = await FacultyModel.create({
        userId: user._id,
        departmentId: department._id,
        employeeId: row['Employee ID'],
        designation: row['Designation'],
        specializations: row['Specializations']?.split(';').map((s: string) => s.trim()) || [],
        qualifications,
        joiningDate: new Date(row['Joining Date']),
        status: row['Status'] || 'active',
        experience: {
          years: parseInt(row['Experience Years']) || 0,
          details: row['Experience Details'] || ''
        }
      });

      results.push({
        name: user.name,
        email: user.email,
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
  const { name, email, password, departmentId, employeeId, ...facultyData } = req.body;

  // Check if department exists
  const department = await DepartmentModel.findById(departmentId);
  if (!department) {
    throw new AppError('No department found with that ID', 404);
  }

  // Check if user with email already exists
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    throw new AppError(`A user with email ${email} already exists. Please use a different email address.`, 400);
  }

  // Validate required fields
  if (!name || !email || !password || !departmentId || !employeeId) {
    throw new AppError('Please provide all required fields: name, email, password, department, and employee ID', 400);
  }

  // Create user first
  const user = await UserModel.create({
    name,
    email,
    password,
    roles: ['faculty'],
    department: departmentId
  });

  // Create faculty with the new user ID
  const faculty = await FacultyModel.create({
    ...facultyData,
    userId: user._id,
    departmentId,
    employeeId,
    qualifications: facultyData.qualifications?.map((q: { degree: string; field?: string; institution?: string; year: number }) => ({
      ...q,
      field: q.field || 'General',
      institution: q.institution || 'Institution Pending'
    }))
  });

  // Populate the faculty data
  const populatedFaculty = await faculty.populate(['userId', 'departmentId']);

  res.status(201).json({
    status: 'success',
    data: { 
      faculty: populatedFaculty
    }
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
      throw new AppError('Department not found', 404);
    }
  }

  // Find faculty first
  const faculty = await FacultyModel.findById(req.params.id);
  if (!faculty) {
    throw new AppError('No faculty found with that ID', 404);
  }

  // Update user if name or email is provided
  if (req.body.name || req.body.email) {
    const user = await UserModel.findById(faculty.userId);
    if (!user) {
      throw new AppError('Associated user not found', 404);
    }

    // If email is being changed, check if new email already exists
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await UserModel.findOne({ email: req.body.email });
      if (existingUser) {
        throw new AppError(`A user with email ${req.body.email} already exists`, 400);
      }
    }

    // Update user
    await UserModel.findByIdAndUpdate(user._id, {
      name: req.body.name || user.name,
      email: req.body.email || user.email
    });
  }

  // Update faculty
  const updatedFaculty = await FacultyModel.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  ).populate('userId', 'name email')
   .populate('departmentId', 'name');

  res.status(200).json({
    status: 'success',
    data: { faculty: updatedFaculty }
  });
});

// Delete faculty
export const deleteFaculty = catchAsync(async (req: Request, res: Response) => {
  // First find the faculty to get user ID
  const faculty = await FacultyModel.findById(req.params.id);

  if (!faculty) {
    throw new AppError('No faculty found with that ID', 404);
  }

  // Get the associated user
  const user = await UserModel.findById(faculty.userId);

  if (user) {
    // If user only has faculty role, delete the user
    if (user.roles.length === 1 && user.roles.includes('faculty')) {
      await UserModel.findByIdAndDelete(user._id);
    } else {
      // If user has other roles, just remove faculty role
      await UserModel.findByIdAndUpdate(user._id, {
        $pull: { roles: 'faculty' }
      });
    }
  }

  // Delete the faculty record
  await FacultyModel.findByIdAndDelete(req.params.id);

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
