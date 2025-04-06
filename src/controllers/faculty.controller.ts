import { Request, Response } from 'express';
import { FacultyModel } from '../models/faculty.model';
import { UserModel } from '../models/user.model';
import { DepartmentModel } from '../models/department.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';

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
