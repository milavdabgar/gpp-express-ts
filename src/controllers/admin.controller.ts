import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/user.model';
import { AppError } from '../middleware/error.middleware';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { Parser } from 'json2csv';
import bcrypt from 'bcryptjs';

// User Management
export const getAllUsers = async (_: Request, res: Response, next: NextFunction) => {
  try {
    const users = await UserModel.find().select('-password');
    res.status(200).json({
      status: 'success',
      data: { users }
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

    const csvRows: any[] = [];
    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => csvRows.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    const users = await Promise.all(
      csvRows.map(async (row) => {
        const hashedPassword = await bcrypt.hash(row.password || 'ChangeMe@123', 12);
        return {
          name: row.name,
          email: row.email,
          password: hashedPassword,
          department: row.department,
          roles: row.roles?.split(',').map((role: string) => role.trim()) || ['student'],
          selectedRole: row.roles?.split(',')[0].trim() || 'student'
        };
      })
    );

    // Process each user individually to handle duplicates
    const importResults = await Promise.all(
      users.map(async (user) => {
        try {
          // Try to update existing user or create new one
          const updatedUser = await UserModel.findOneAndUpdate(
            { email: user.email },
            user,
            { upsert: true, new: true }
          );
          return { success: true, user: updatedUser };
        } catch (error) {
          return { success: false, email: user.email, error };
        }
      })
    );

    const successful = importResults.filter(r => r.success).length;
    const failed = importResults.filter(r => !r.success).length;

    res.status(200).json({
      status: 'success',
      message: `${successful} users imported/updated successfully, ${failed} failed`
    });
  } catch (error) {
    next(error);
  }
};

export const exportUsers = async (_: Request, res: Response, next: NextFunction) => {
  try {
    const users = await UserModel.find().select('-password -__v');
    
    const fields = ['name', 'email', 'department', 'roles', 'selectedRole', 'createdAt'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(users);

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
