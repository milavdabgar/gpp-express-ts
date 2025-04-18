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

// Helper function to sync a single user
export const syncStudentUser = async (user: any) => {
  // Only sync if user has student role
  if (!user.roles.includes('student')) {
    return null;
  }

  // Check if student record already exists
  const existingStudent = await StudentModel.findOne({ userId: user._id });
  if (existingStudent) {
    return existingStudent;
  }

  // Get current year for enrollment number
  const currentYear = new Date().getFullYear();
  
  // Get the last enrollment number for this year
  const lastStudent = await StudentModel.findOne(
    { enrollmentNo: new RegExp(`^${currentYear}`) },
    { enrollmentNo: 1 },
    { sort: { enrollmentNo: -1 } }
  );

  // Generate next enrollment number
  const counter = lastStudent?.enrollmentNo
    ? parseInt(lastStudent.enrollmentNo.substring(4)) + 1
    : 1;
  const enrollmentNo = `${currentYear}${counter.toString().padStart(4, '0')}`;

  // Create new student record
  return StudentModel.create({
    userId: user._id,
    departmentId: user.department,
    enrollmentNo,
    batch: `${currentYear}-${currentYear + 4}`,
    status: 'active'
  });
};

// Sync all users with student role
export const syncStudentUsers = catchAsync(async (_req: Request, res: Response) => {
  // Get all users with student role
  const users = await UserModel.find({ roles: 'student' });
  const results = { created: 0, existing: 0, errors: [] as string[] };

  for (const user of users) {
    try {
      const student = await syncStudentUser(user);
      if (student) {
        if (student.isNew) {
          results.created++;
        } else {
          results.existing++;
        }
      }
    } catch (error) {
      results.errors.push(`Error creating student for user ${user.name}: ${(error as Error).message}`);
    }
  }

  res.status(200).json({
    status: 'success',
    data: results,
  });
});

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
    // Basic Info
    { label: 'Enrollment No', value: 'enrollmentNo' },
    { label: 'Name', value: 'name' },
    { label: 'Email', value: 'email' },
    { label: 'Department', value: 'department' },
    { label: 'Batch', value: 'batch' },
    { label: 'Semester', value: 'semester' },
    { label: 'Status', value: 'status' },
    { label: 'Admission Date', value: 'admissionDate' },
    // Contact Info
    { label: 'Mobile', value: 'contact.mobile' },
    { label: 'Contact Email', value: 'contact.email' },
    { label: 'Address', value: 'contact.address' },
    { label: 'City', value: 'contact.city' },
    { label: 'State', value: 'contact.state' },
    { label: 'Pincode', value: 'contact.pincode' },
    // Guardian Info
    { label: 'Guardian Name', value: 'guardian.name' },
    { label: 'Guardian Relation', value: 'guardian.relation' },
    { label: 'Guardian Contact', value: 'guardian.contact' },
    { label: 'Guardian Occupation', value: 'guardian.occupation' },
    // Education Background
    { label: 'Education Background', value: 'educationBackground' }
  ];

  // Convert students to plain objects with proper type handling
  const studentsData = students.map(student => {
    const plainStudent = student.toObject();
    const user = plainStudent.userId as unknown as { name: string; email: string } | null;
    const dept = plainStudent.departmentId as unknown as { name: string } | null;

    // Format education background as a string
    const educationStr = plainStudent.educationBackground?.map((edu: any) => 
      `${edu.degree}|${edu.institution}|${edu.board}|${edu.percentage}|${edu.yearOfPassing}`
    ).join('; ') || '';

    return {
      // Basic Info
      enrollmentNo: plainStudent.enrollmentNo || '',
      name: user?.name || '',
      email: user?.email || '',
      department: dept?.name || '',
      batch: plainStudent.batch || '',
      semester: plainStudent.semester || '',
      status: plainStudent.status || '',
      admissionDate: plainStudent.admissionDate ? new Date(plainStudent.admissionDate).toISOString().split('T')[0] : '',
      // Contact Info
      contact: {
        mobile: plainStudent.contact?.mobile || '',
        email: plainStudent.contact?.email || '',
        address: plainStudent.contact?.address || '',
        city: plainStudent.contact?.city || '',
        state: plainStudent.contact?.state || '',
        pincode: plainStudent.contact?.pincode || ''
      },
      // Guardian Info
      guardian: {
        name: plainStudent.guardian?.name || '',
        relation: plainStudent.guardian?.relation || '',
        contact: plainStudent.guardian?.contact || '',
        occupation: plainStudent.guardian?.occupation || ''
      },
      // Education Background
      educationBackground: educationStr
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
      .on('data', (data) => {
        // Process education background from string to array
        const educationBackground = data['Education Background'] ? 
          data['Education Background'].split(';').map((edu: string) => {
            const [degree, institution, board, percentage, yearOfPassing] = edu.split('|');
            return {
              degree: degree?.trim(),
              institution: institution?.trim(),
              board: board?.trim(),
              percentage: parseFloat(percentage) || 0,
              yearOfPassing: parseInt(yearOfPassing) || new Date().getFullYear()
            };
          }) : [];

        results.push({
          ...data,
          educationBackground
        });
      })
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
        admissionDate: row['Admission Date'] || row.admissionDate || new Date().toISOString().split('T')[0],
        // Contact Info
        contact: {
          mobile: row['Mobile'] || '',
          email: row['Contact Email'] || row.email,
          address: row['Address'] || '',
          city: row['City'] || '',
          state: row['State'] || '',
          pincode: row['Pincode'] || ''
        },
        // Guardian Info
        guardian: {
          name: row['Guardian Name'] || '',
          relation: row['Guardian Relation'] || '',
          contact: row['Guardian Contact'] || '',
          occupation: row['Guardian Occupation'] || ''
        },
        // Education Background
        educationBackground: row.educationBackground || []
      };

      // Check if user exists
      let user = await UserModel.findOne({ email: studentData.email });

      if (!user) {
        // Create new user
        const password = await bcrypt.hash('Student@123', 12); // Default password
        user = await UserModel.create({
          name: studentData.name,
          email: studentData.email,
          password,
          roles: ['student'],
          selectedRole: 'student'
        });
      }

      // Find department by name
      const department = await DepartmentModel.findOne({ name: studentData.department });
      if (!department) {
        throw new Error(`Department ${studentData.department} not found`);
      }

      // Check if student with enrollment number already exists
      const existingStudent = await StudentModel.findOne({ 
        enrollmentNo: studentData.enrollmentNo 
      });
      
      if (existingStudent) {
        throw new Error(`Enrollment number ${studentData.enrollmentNo} already exists`);
      }

      // Create student record
      const student = await StudentModel.create({
        userId: user._id,
        departmentId: department._id,
        enrollmentNo: studentData.enrollmentNo,
        semester: parseInt(studentData.semester) || 1,
        batch: studentData.batch,
        admissionDate: new Date(studentData.admissionDate),
        status: studentData.status,
        // Contact Info
        contact: studentData.contact,
        // Guardian Info
        guardian: studentData.guardian,
        // Education Background
        educationBackground: studentData.educationBackground
      });

      students.push(student);
    } catch (error) {
      errors.push(`Error creating student: ${(error as Error).message}`);
    }
  }

  res.status(200).json({
    status: 'success',
    data: { 
      students,
      errors,
      totalCreated: students.length,
      totalErrors: errors.length
    }
  });
});