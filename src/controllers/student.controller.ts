import { Request, Response } from 'express';
import { StudentModel } from '../models/student.model';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { catchAsync } from '../utils/async.utils';
import AppError from '../utils/appError';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { Parser } from 'json2csv';

// Get all students
export const getAllStudents = catchAsync(async (_req: Request, res: Response) => {
  const students = await StudentModel.find()
    .populate('userId', 'name email roles')
    .populate('departmentId', 'name');

  res.status(200).json({
    status: 'success',
    data: { students }
  });
});

// Create student
export const createStudent = catchAsync(async (req: Request, res: Response) => {
  const { name, email, password, rollNo, departmentId, semester, batch, joiningDate } = req.body;

  // Check if user with email already exists
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    throw new AppError(`A user with email ${email} already exists. Please use a different email address.`, 400);
  }

  // Validate required fields
  if (!name || !email || !password || !departmentId || !rollNo || !semester || !batch) {
    throw new AppError('Please provide all required fields: name, email, password, department, roll number, semester, and batch', 400);
  }

  // Check if roll number already exists
  const existingStudent = await StudentModel.findOne({ rollNo });
  if (existingStudent) {
    throw new AppError(`A student with roll number ${rollNo} already exists`, 400);
  }

  // Create user first
  const user = await UserModel.create({
    name,
    email,
    password,
    roles: ['student']
  });

  // Create student
  const student = await StudentModel.create({
    userId: user._id,
    departmentId,
    rollNo,
    semester,
    batch,
    joiningDate: joiningDate || new Date(),
    status: 'active'
  });

  const populatedStudent = await student.populate([
    { path: 'userId', select: 'name email' },
    { path: 'departmentId', select: 'name' }
  ]);

  res.status(201).json({
    status: 'success',
    data: { 
      student: populatedStudent,
      password
    }
  });
});

// Update student
export const updateStudent = catchAsync(async (req: Request, res: Response) => {
  // If updating department, check if it exists
  if (req.body.departmentId) {
    const department = await DepartmentModel.findById(req.body.departmentId);
    if (!department) {
      throw new AppError('Department not found', 404);
    }
  }

  // Find student first
  const student = await StudentModel.findById(req.params.id);
  if (!student) {
    throw new AppError('No student found with that ID', 404);
  }

  // Update user if name or email is provided
  if (req.body.name || req.body.email) {
    const user = await UserModel.findById(student.userId);
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

  // If updating roll number, check if it already exists
  if (req.body.rollNo && req.body.rollNo !== student.rollNo) {
    const existingStudent = await StudentModel.findOne({ rollNo: req.body.rollNo });
    if (existingStudent) {
      throw new AppError(`A student with roll number ${req.body.rollNo} already exists`, 400);
    }
  }

  // Update student
  const updatedStudent = await StudentModel.findByIdAndUpdate(
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
    data: { student: updatedStudent }
  });
});

// Delete student
export const deleteStudent = catchAsync(async (req: Request, res: Response) => {
  // First find the student to get user ID
  const student = await StudentModel.findById(req.params.id);

  if (!student) {
    throw new AppError('No student found with that ID', 404);
  }

  // Get the associated user
  const user = await UserModel.findById(student.userId);

  if (user) {
    // If user only has student role, delete the user
    if (user.roles.length === 1 && user.roles.includes('student')) {
      await UserModel.findByIdAndDelete(user._id);
    } else {
      // If user has other roles, just remove student role
      await UserModel.findByIdAndUpdate(user._id, {
        $pull: { roles: 'student' }
      });
    }
  }

  // Delete the student record
  await StudentModel.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Upload students from CSV
// Export students to CSV
export const exportStudentsCsv = catchAsync(async (_req: Request, res: Response) => {
  const students = await StudentModel.find()
    .populate('userId', 'name email roles')
    .populate('departmentId', 'name');

  const fields = [
    'userId.name',
    'userId.email',
    'enrollmentNo',
    'departmentId.name',
    'batch',
    'semester',
    'status',
    'guardian.name',
    'guardian.relation',
    'guardian.contact',
    'guardian.occupation',
    'contact.mobile',
    'contact.email',
    'contact.address',
    'contact.city',
    'contact.state',
    'contact.pincode'
  ];

  const json2csvParser = new Parser({ fields });
  const csvData = json2csvParser.parse(students);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
  res.status(200).send(csvData);
});

export const uploadStudentsCsv = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Please upload a CSV file', 400);
  }

  const results: any[] = [];
  const stream = Readable.from(req.file.buffer.toString());

  await new Promise((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  const students = [];

  for (const row of results) {
    try {
      // Check if user already exists
      const existingUser = await UserModel.findOne({ email: row.email });
      if (existingUser) {
        console.log(`Skipping user ${row.name} as email ${row.email} already exists`);
        continue;
      }

      // Check if roll number already exists
      const existingStudent = await StudentModel.findOne({ rollNo: row.rollNo });
      if (existingStudent) {
        console.log(`Skipping student with roll number ${row.rollNo} as it already exists`);
        continue;
      }

      // Create user
      const user = await UserModel.create({
        name: row.name,
        email: row.email,
        password: 'Student@123',
        roles: ['student']
      });

      // Create student
      const student = await StudentModel.create({
        userId: user._id,
        departmentId: row.departmentId,
        rollNo: row.rollNo,
        semester: parseInt(row.semester),
        batch: row.batch,
        joiningDate: row.joiningDate || new Date(),
        status: 'active'
      });

      const populatedStudent = await student.populate([
        { path: 'userId', select: 'name email' },
        { path: 'departmentId', select: 'name' }
      ]);

      students.push(populatedStudent);
    } catch (error) {
      console.error(`Error creating student entry for user ${row.name}:`, error);
    }
  }

  res.status(201).json({
    status: 'success',
    data: { students }
  });
});
