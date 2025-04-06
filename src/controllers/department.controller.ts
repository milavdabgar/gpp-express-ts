import { Request, Response } from 'express';
import { Department } from '../models/department';
import { UserModel } from '../models/user.model';
import { AppError } from '../middleware/error.middleware';
import { catchAsync } from '../utils/async.utils';

// Get all departments
export const getAllDepartments = catchAsync(async (_req: Request, res: Response) => {
  const departments = await Department.find()
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
  const department = await Department.findById(req.params.id)
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

  const department = await Department.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      department
    }
  });
});

// Update department
export const updateDepartment = catchAsync(async (req: Request, res: Response) => {
  // If hodId is being updated, verify that user exists and has appropriate role
  if (req.body.hodId) {
    const user = await UserModel.findById(req.body.hodId);
    if (!user) {
      throw new AppError('No user found with that ID', 404);
    }
    // Ensure user has HOD role
    if (!user.roles.includes('hod')) {
      throw new AppError('User must have HOD role to be assigned as department head', 400);
    }
  }

  const department = await Department.findByIdAndUpdate(
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
  const department = await Department.findByIdAndDelete(req.params.id);

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
  const stats = await Department.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'department',
        as: 'users'
      }
    },
    {
      $project: {
        name: 1,
        code: 1,
        isActive: 1,
        userCount: { $size: '$users' },
        hasHOD: { $cond: [{ $ne: ['$hodId', null] }, true, false] }
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
