import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { AppError } from '../middleware/error.middleware';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { Parser } from 'json2csv';
import bcrypt from 'bcryptjs';

// User Management
export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, department, roles, password = '123456' } = req.body;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const user = await UserModel.create({
      name,
      email,
      department,
      roles,
      password: hashedPassword,
      selectedRole: roles[0]
    });

    // Convert to plain object and remove password
    const userResponse = user.toObject();
    const { password: _, ...userWithoutPassword } = userResponse;

    res.status(201).json({
      status: 'success',
      data: { user: userWithoutPassword }
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const role = req.query.role as string;
    const department = req.query.department as string;
    const sortBy = req.query.sortBy as string || 'name';
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'asc';

    // Build query
    let query: any = {};

    // Role filter
    if (role && role !== 'all') {
      query.roles = role;
    }

    // Department filter
    if (department && department !== 'all') {
      query.department = department;
    }

    // Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Sort configuration
    const sortConfig: { [key: string]: 1 | -1 } = {
      [sortBy]: sortOrder === 'desc' ? -1 : 1
    };

    const [users, total] = await Promise.all([
      UserModel.find(query)
        .select('-password')
        .sort(sortConfig)
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(query)
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await UserModel.findById(req.params.id).select('-password');
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, department, roles } = req.body;
    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { name, email, department, roles },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await UserModel.findByIdAndDelete(req.params.id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// CSV Import/Export
export const importUsers = async (req: Request & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return next(new AppError('Please upload a CSV file', 400));
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

    const users = [];
    const errors = [];

    for (const row of results) {
      try {
        // Map friendly column names to actual data
        const userData = {
          name: row['Name'] || row.name,
          email: row['Email'] || row.email,
          department: row['Department'] || row.department,
          roles: row['Roles'] || row.roles,
          selectedRole: row['Selected Role'] || row.selectedRole || 'faculty'
        };

        // Find department by name
        const department = await DepartmentModel.findOne({ 
          name: { $regex: new RegExp(`^${userData.department}$`, 'i') }
        });
        
        if (!department) {
          errors.push(`Skipping user ${userData.name}: Department '${userData.department}' not found`);
          continue;
        }

        // Check if user with email already exists
        const existingUser = await UserModel.findOne({ email: userData.email });
        if (existingUser) {
          errors.push(`Skipping user ${userData.name}: Email '${userData.email}' already exists`);
          continue;
        }

        // Parse roles from CSV
        const roles = userData.roles
          ? userData.roles.split(',').map((role: string) => role.trim())
          : ['faculty'];

        // Create user
        const hashedPassword = await bcrypt.hash('User@123', 12);
        const user = await UserModel.create({
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          department: department._id,
          roles: roles,
          selectedRole: userData.selectedRole
        });

        const populatedUser = await user.populate('department', 'name');
        users.push(populatedUser);
      } catch (error) {
        errors.push(`Error creating user ${row['Name'] || row.name}: ${error.message}`);
      }
    }

    res.status(201).json({
      status: 'success',
      data: { 
        users,
        errors,
        summary: `Successfully imported ${users.length} users. ${errors.length} errors encountered.`
      }
    });
  } catch (error) {
    next(error);
  }
};

export const exportUsers = async (_: Request, res: Response, next: NextFunction) => {
  try {
    const users = await UserModel.find()
      .select('-password -__v')
      .populate({
        path: 'department',
        model: 'Department',
        select: 'name'
      });
    
    const fields = [
      { label: 'Name', value: 'name' },
      { label: 'Email', value: 'email' },
      { label: 'Department', value: 'departmentName' },
      { label: 'Roles', value: 'rolesString' },
      { label: 'Selected Role', value: 'selectedRole' },
      { label: 'Created At', value: 'createdAtFormatted' }
    ];

    const usersData = users.map(user => {
      const plainUser = user.toObject();
      const dept = plainUser.department as unknown as { name: string } | null;
      return {
        name: plainUser.name || '',
        email: plainUser.email || '',
        departmentName: dept?.name || '',
        rolesString: (plainUser.roles || []).join(', '),
        selectedRole: plainUser.selectedRole || '',
        createdAtFormatted: new Date().toISOString().split('T')[0]
      };
    });

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(usersData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

// Role Management
export const getRoles = async (_: Request, res: Response) => {
  const roles = ['student', 'faculty', 'hod', 'principal', 'admin', 'jury'];
  res.status(200).json({
    status: 'success',
    data: { roles }
  });
};

export const assignRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, roles } = req.body;
    
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { roles, selectedRole: roles[0] },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};
