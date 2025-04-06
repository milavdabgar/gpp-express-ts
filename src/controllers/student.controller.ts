import { Request, Response } from 'express';
import { StudentModel } from '../models/student.model';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';
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

// Get single student
export const getStudent = catchAsync(async (req: Request, res: Response) => {
  const student = await StudentModel.findById(req.params.id)
    .populate('userId', 'name email roles')
    .populate('departmentId', 'name');

  if (!student) {
    throw new AppError('No student found with that ID', 404);
  }

  res.status(200).json({
    status: 'success',
    data: { student }
  });
});

// Create student
export const createStudent = catchAsync(async (req: Request, res: Response) => {
  const { name, email, password, enrollmentNo, departmentId, semester, batch, admissionDate } = req.body;

  // Check if user with email already exists
  const existingUser = await UserModel.findOne({ email });
  let userId = null;
  
  if (existingUser) {
    // If user exists, check if it has student role
    if (!existingUser.roles.includes('student')) {
      existingUser.roles.push('student');
      await existingUser.save();
    }
    userId = existingUser._id;
  } else {
    // Create user first
    const user = await UserModel.create({
      name,
      email,
      password,
      department: departmentId,
      roles: ['student'],
      selectedRole: 'student'
    });
    userId = user._id;
  }

  // Check if enrollment number already exists
  const existingStudent = await StudentModel.findOne({ enrollmentNo });
  if (existingStudent) {
    throw new AppError(`A student with enrollment number ${enrollmentNo} already exists`, 400);
  }

  // Create student
  const student = await StudentModel.create({
    userId,
    departmentId,
    enrollmentNo,
    semester: parseInt(semester),
    batch,
    admissionDate: admissionDate || new Date(),
    status: 'active',
    guardian: req.body.guardian || {
      name: '',
      relation: '',
      contact: '',
      occupation: ''
    },
    contact: req.body.contact || {
      mobile: '',
      email,
      address: '',
      city: '',
      state: '',
      pincode: ''
    },
    educationBackground: req.body.educationBackground || []
  });

  const populatedStudent = await student.populate([
    { path: 'userId', select: 'name email' },
    { path: 'departmentId', select: 'name' }
  ]);

  res.status(201).json({
    status: 'success',
    data: { 
      student: populatedStudent
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
      email: req.body.email || user.email,
      department: req.body.departmentId || user.department
    });
  }

  // If updating enrollment number, check if it already exists
  if (req.body.enrollmentNo && req.body.enrollmentNo !== student.enrollmentNo) {
    const existingStudent = await StudentModel.findOne({ enrollmentNo: req.body.enrollmentNo });
    if (existingStudent) {
      throw new AppError(`A student with enrollment number ${req.body.enrollmentNo} already exists`, 400);
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

// Get students by department
export const getStudentsByDepartment = catchAsync(async (req: Request, res: Response) => {
  const students = await StudentModel.find({ departmentId: req.params.departmentId })
    .populate('userId', 'name email')
    .populate('departmentId', 'name');

  res.status(200).json({
    status: 'success',
    data: { students }
  });
});

// Export students to CSV
// Export students to CSV
export const exportStudentsCsv = catchAsync(async (_req: Request, res: Response) => {
  const students = await StudentModel.find()
    .populate('userId', 'name email roles')
    .populate('departmentId', 'name');

  const fields = [
    'enrollmentNo',
    'userId.name',
    'userId.email',
    'departmentId.name',
    'batch',
    'semester',
    'status',
    'admissionDate'
  ];

  // Convert students to plain objects with proper type handling
  const studentsData = students.map(student => {
    const plainStudent = student.toObject();
    return {
      enrollmentNo: plainStudent.enrollmentNo,
      'userId.name': plainStudent.userId && typeof plainStudent.userId === 'object' ? 
        (plainStudent.userId as any).name : '',
      'userId.email': plainStudent.userId && typeof plainStudent.userId === 'object' ? 
        (plainStudent.userId as any).email : '',
      'departmentId.name': plainStudent.departmentId && typeof plainStudent.departmentId === 'object' ? 
        (plainStudent.departmentId as any).name : '',
      batch: plainStudent.batch,
      semester: plainStudent.semester,
      status: plainStudent.status,
      admissionDate: plainStudent.admissionDate
    };
  });

  const parser = new Parser({ fields });
  const csv = parser.parse(studentsData);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
  res.status(200).send(csv);
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
      // Find or create department
      let department = await DepartmentModel.findOne({ name: row.department });
      if (!department) {
        department = await DepartmentModel.findOne({ _id: row.departmentId });
        if (!department) {
          console.log(`Skipping student with department ${row.department || row.departmentId} as it doesn't exist`);
          continue;
        }
      }

      // Create or update user
      let user;
      const existingUser = await UserModel.findOne({ email: row.email });
      if (existingUser) {
        user = existingUser;
        if (!user.roles.includes('student')) {
          user.roles.push('student');
          await user.save();
        }
      } else {
        user = await UserModel.create({
          name: row.name,
          email: row.email,
          password: 'Student@123', // Default password
          department: department._id,
          roles: ['student'],
          selectedRole: 'student'
        });
      }

      // Check if student with enrollment number already exists
      const existingStudent = await StudentModel.findOne({ enrollmentNo: row.enrollmentNo });
      if (existingStudent) {
        console.log(`Skipping student with enrollment number ${row.enrollmentNo} as it already exists`);
        continue;
      }

      // Create student
      const student = await StudentModel.create({
        userId: user._id,
        departmentId: department._id,
        enrollmentNo: row.enrollmentNo,
        semester: parseInt(row.semester) || 1,
        batch: row.batch || '2022-2025',
        admissionDate: row.admissionDate || new Date(),
        status: row.status || 'active',
        guardian: {
          name: row.guardianName || '',
          relation: row.guardianRelation || '',
          contact: row.guardianContact || '',
          occupation: row.guardianOccupation || ''
        },
        contact: {
          mobile: row.mobile || '',
          email: row.email || '',
          address: row.address || '',
          city: row.city || '',
          state: row.state || '',
          pincode: row.pincode || ''
        }
      });

      const populatedStudent = await student.populate([
        { path: 'userId', select: 'name email' },
        { path: 'departmentId', select: 'name' }
      ]);

      students.push(populatedStudent);
    } catch (error) {
      console.error(`Error creating student entry:`, error);
    }
  }

  res.status(201).json({
    status: 'success',
    data: { students }
  });
});