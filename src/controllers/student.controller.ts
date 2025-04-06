import { Request, Response } from 'express';
import { StudentModel } from '../models/student.model';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { AppError } from '../middleware/error.middleware';
import { catchAsync } from '../utils/catchAsync';
import csv from 'csv-parser';
import { Parser } from 'json2csv';
import { Readable } from 'stream';
import bcrypt from 'bcryptjs';

// Get all students
export const getAllStudents = catchAsync(async (_req: Request, res: Response) => {
  const students = await StudentModel.find({ userId: { $ne: null } })
    .populate('userId', 'name email roles')
    .populate('departmentId', 'name');

  res.status(200).json({
    status: 'success',
    data: { students }
  });
});

// Get single student
export const getStudent = catchAsync(async (req: Request, res: Response) => {
  const student = await StudentModel.findOne({ _id: req.params.id, userId: { $ne: null } })
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
  const student = await StudentModel.findOne({ _id: req.params.id, userId: { $ne: null } });
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
  const students = await StudentModel.find({ departmentId: req.params.departmentId, userId: { $ne: null } })
    .populate('userId', 'name email roles')
    .populate('departmentId', 'name');

  res.status(200).json({
    status: 'success',
    data: { students }
  });
});

// Export students to CSV
// Export students to CSV
export const exportStudentsCsv = catchAsync(async (_req: Request, res: Response) => {
  const students = await StudentModel.find({ userId: { $ne: null } })
    .populate('userId', 'name email roles')
    .populate('departmentId', 'name');

  const fields = [
    { label: 'Enrollment No', value: 'enrollmentNo' },
    { label: 'Name', value: 'name' },
    { label: 'Email', value: 'email' },
    { label: 'Department', value: 'department' },
    { label: 'Batch', value: 'batch' },
    { label: 'Semester', value: 'semester' },
    { label: 'Status', value: 'status' },
    { label: 'Admission Date', value: 'admissionDate' }
  ];

  // Convert students to plain objects with proper type handling
  const studentsData = students.map(student => {
    const plainStudent = student.toObject();
    const user = plainStudent.userId as unknown as { name: string; email: string } | null;
    const dept = plainStudent.departmentId as unknown as { name: string } | null;
    return {
      enrollmentNo: plainStudent.enrollmentNo || '',
      name: user?.name || '',
      email: user?.email || '',
      department: dept?.name || '',
      batch: plainStudent.batch || '',
      semester: plainStudent.semester || '',
      status: plainStudent.status || '',
      admissionDate: plainStudent.admissionDate ? new Date(plainStudent.admissionDate).toISOString().split('T')[0] : ''
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
  const errors = [];

  for (const row of results) {
    try {
      // Map friendly column names to actual data
      const studentData = {
        name: row['Name'] || row.name,
        email: row['Email'] || row.email,
        department: row['Department'] || row.department,
        enrollmentNo: row['Enrollment No'] || row.enrollmentNo,
        batch: row['Batch'] || row.batch,
        semester: row['Semester'] || row.semester,
        status: row['Status'] || row.status || 'active',
        admissionDate: row['Admission Date'] || row.admissionDate || new Date().toISOString().split('T')[0]
      };

      // Find department by name
      const department = await DepartmentModel.findOne({ 
        name: { $regex: new RegExp(`^${studentData.department}$`, 'i') }
      });
      
      if (!department) {
        errors.push(`Skipping student ${studentData.name}: Department '${studentData.department}' not found`);
        continue;
      }

      // Create or find user
      let user = await UserModel.findOne({ email: studentData.email });
      if (!user) {
        const hashedPassword = await bcrypt.hash('Student@123', 12);
        user = await UserModel.create({
          name: studentData.name,
          email: studentData.email,
          password: hashedPassword,
          department: department._id,
          roles: ['student'],
          selectedRole: 'student'
        });
      } else if (!user.roles.includes('student')) {
        user.roles.push('student');
        await user.save();
      }

      // Check if student with enrollment number already exists
      const existingStudent = await StudentModel.findOne({ 
        enrollmentNo: studentData.enrollmentNo 
      });
      
      if (existingStudent) {
        errors.push(`Skipping student ${studentData.name}: Enrollment number '${studentData.enrollmentNo}' already exists`);
        continue;
      }

      // Create student
      const student = await StudentModel.create({
        userId: user._id,
        departmentId: department._id,
        enrollmentNo: studentData.enrollmentNo,
        semester: parseInt(studentData.semester) || 1,
        batch: studentData.batch,
        admissionDate: new Date(studentData.admissionDate),
        status: studentData.status,
        guardian: {
          name: row['Guardian Name'] || '',
          relation: row['Guardian Relation'] || '',
          contact: row['Guardian Contact'] || '',
          occupation: row['Guardian Occupation'] || ''
        },
        contact: {
          mobile: row['Mobile'] || '',
          email: studentData.email,
          address: row['Address'] || '',
          city: row['City'] || '',
          state: row['State'] || '',
          pincode: row['Pincode'] || ''
        }
      });

      const populatedStudent = await student.populate([
        { path: 'userId', select: 'name email' },
        { path: 'departmentId', select: 'name' }
      ]);

      students.push(populatedStudent);
    } catch (error) {
      errors.push(`Error creating student ${row['Name'] || row.name}: ${error.message}`);
    }
  }

  res.status(201).json({
    status: 'success',
    data: { 
      students,
      errors,
      summary: `Successfully imported ${students.length} students. ${errors.length} errors encountered.`
    }
  });
});