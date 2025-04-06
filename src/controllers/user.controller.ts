import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/user.model';
import { AppError } from '../middleware/error.middleware';

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    const user = await UserModel.findById(req.user._id);
    
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1) Create error if user tries to update password
    if (req.body.password) {
      return next(
        new AppError(
          'This route is not for password updates. Please use /updatePassword',
          400
        )
      );
    }

    // 2) Filter out unwanted fields that are not allowed to be updated
    const filteredBody = filterObj(req.body, 'name', 'email', 'department');

    // 3) Update user document
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      req.user._id,
      filteredBody,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

const filterObj = (obj: any, ...allowedFields: string[]) => {
  const newObj: any = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};
