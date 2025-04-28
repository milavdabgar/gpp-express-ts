import { Request, Response } from 'express';
import { Parser } from 'json2csv';
import { StudentModel } from '../models/student.model';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { AppError } from '../middleware/error.middleware';
import { catchAsync } from '../utils/catchAsync';
import csv from 'csv-parser';
import { Readable } from 'stream';

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
export const getAllStudents = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const skip = (page - 1) * limit;

  const [students, total] = await Promise.all([
    StudentModel.find()
      .populate({ 
        path: 'userId',
        select: 'name email roles'
      })
      .populate({
        path: 'departmentId',
        select: 'name'
      })
      .skip(skip)
      .limit(limit)
      .lean(),
    StudentModel.countDocuments()
  ]);

  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    status: 'success',
    data: {
      students,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    }
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

    // First cast to unknown then to the expected type
    const user = (plainStudent as any).userId as { name: string; email: string } | null;
    const dept = (plainStudent as any).departmentId as { name: string } | null;

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

// Helper function to get current semester based on semester status
function calculateCurrentSemester(semesterStatus: any): number {
  const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const sem of semesters.reverse()) {
    if (semesterStatus[`sem${sem}`] !== 'NOT_ATTEMPTED') {
      return Math.min(sem + 1, 8);
    }
  }
  return 1;
}

function mapSemesterStatus(value: string): 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED' {
  if (!value) return 'NOT_ATTEMPTED';
  const numValue = parseInt(value);
  if (isNaN(numValue)) return 'NOT_ATTEMPTED';
  if (numValue === 2) return 'CLEARED';
  if (numValue === 1) return 'PENDING';
  return 'NOT_ATTEMPTED';
}

export const importGTUStudents = catchAsync(async (req: Request & { file?: Express.Multer.File }, res: Response) => {
  try {
    if (!req.file) {
      throw new AppError('Please upload a CSV file', 400);
    }

    const results: any[] = [];
    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve())
        .on('error', (error) => reject(new Error(`Error parsing CSV: ${error.message}`)));
    });

    if (results.length === 0) {
      throw new AppError('CSV file is empty or malformed', 400);
    }

    const processedStudents = [];
    const errors: { row: number; error: string }[] = [];
    const warnings: { row: number; warning: string }[] = [];

    for (const [index, row] of results.entries()) {
      try {
        const enrollmentNo = row.map_number?.toString().trim();
        if (!enrollmentNo) {
          errors.push({ row: index + 1, error: 'Missing enrollment number' });
          continue;
        }

        // Handle the name properly
        const fullName = row.Name?.trim() || '';
        if (!fullName) {
          warnings.push({ row: index + 1, warning: 'Missing student name' });
        }

        // Split name into parts and ensure proper formatting
        const nameParts = fullName.split(' ').filter((part: string) => part.length > 0);
        const firstName = nameParts[0] || '';
        const lastName = nameParts[nameParts.length - 1] || '';
        const middleName = nameParts.slice(1, -1).join(' ') || '';

        // Generate institutional email
        const institutionalEmail = `${enrollmentNo.toLowerCase()}@gppalanpur.ac.in`;
        const personalEmail = row.Email?.trim() || '';

        const branchCode = row.BR_CODE?.toString().padStart(2, '0');
        if (!branchCode) {
          errors.push({ row: index + 1, error: 'Missing branch code' });
          continue;
        }

        const department = await DepartmentModel.findOne({ code: branchCode });
        if (!department) {
          warnings.push({ row: index + 1, warning: `Department not found for branch code: ${branchCode}` });
          continue;
        }

        // Ensure user record has the proper name
        let userId = null;
        let existingUser = await UserModel.findOne({ email: institutionalEmail });
        
        if (existingUser) {
          // Update existing user's name if it was N/A
          if (existingUser.name === 'N/A' && fullName) {
            await UserModel.findByIdAndUpdate(userId, { name: fullName });
          }
          if (!existingUser.roles.includes('student')) {
            existingUser.roles.push('student');
            await existingUser.save();
          }
          userId = existingUser._id;
        } else {
          // Create new user with proper name
          const user = await UserModel.create({
            name: fullName || 'N/A',  // Only use N/A if name is completely empty
            email: institutionalEmail,
            password: enrollmentNo,
            department: department._id,
            roles: ['student'],
            selectedRole: 'student'
          });
          userId = user._id;
        }

        // Process and store the student
        const student = await StudentModel.findOneAndUpdate(
          { enrollmentNo },
          {
            userId,
            enrollmentNo,
            firstName,
            middleName,
            lastName,
            fullName,
            personalEmail,
            institutionalEmail,
            departmentId: department._id,
            contact: {
              mobile: row.Mobile?.trim() || '',
              email: personalEmail || institutionalEmail,
              address: '',
              city: '',
              state: '',
              pincode: ''
            },
            gender: row.Gender?.trim() || '',
            category: row.Category?.trim() || 'OPEN',
            aadharNo: row.aadhar?.trim() || '',
            semesterStatus: {
              sem1: mapSemesterStatus(row.SEM1),
              sem2: mapSemesterStatus(row.SEM2),
              sem3: mapSemesterStatus(row.SEM3),
              sem4: mapSemesterStatus(row.SEM4),
              sem5: mapSemesterStatus(row.SEM5),
              sem6: mapSemesterStatus(row.SEM6),
              sem7: mapSemesterStatus(row.SEM7),
              sem8: mapSemesterStatus(row.SEM8)
            },
            semester: calculateCurrentSemester({
              sem1: mapSemesterStatus(row.SEM1),
              sem2: mapSemesterStatus(row.SEM2),
              sem3: mapSemesterStatus(row.SEM3),
              sem4: mapSemesterStatus(row.SEM4),
              sem5: mapSemesterStatus(row.SEM5),
              sem6: mapSemesterStatus(row.SEM6),
              sem7: mapSemesterStatus(row.SEM7),
              sem8: mapSemesterStatus(row.SEM8)
            }),
            batch: `${parseInt('20' + enrollmentNo.substring(0, 2))}-${parseInt('20' + enrollmentNo.substring(0, 2)) + 4}`,
            status: 'active'
          },
          { upsert: true, new: true }
        );

        processedStudents.push(student);
      } catch (error) {
        errors.push({ 
          row: index + 1, 
          error: `Failed to process student: ${(error as Error).message}`
        });
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        results: processedStudents,
        count: processedStudents.length,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    });
  } catch (error) {
    console.error('Error importing students:', error);
    throw new AppError('Failed to import students', 500);
  }
});