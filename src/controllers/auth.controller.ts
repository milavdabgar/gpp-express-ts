import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel, IUser } from '../models/user.model';
import { AppError } from '../middleware/error.middleware';
import { syncStudentUser } from './student.controller';

const signToken = (id: string, selectedRole: string): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.sign(
    { id, selectedRole },
    secret
  );
};

const createSendToken = (user: IUser, statusCode: number, res: Response): void => {
  const token = signToken(user._id.toString(), user.selectedRole!);

  // Remove password from output
  const userObject = user.toObject();
  delete userObject.password;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: userObject,
    },
  });
};

export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const newUser = await UserModel.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      department: req.body.department,
      roles: req.body.roles || ['student'],
      selectedRole: req.body.selectedRole,
    });

    // If user has student role, create student record
    if (newUser.roles.includes('student')) {
      await syncStudentUser(newUser);
    }

    createSendToken(newUser, 201, res);
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, selectedRole } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
      return next(new AppError('Please provide email and password', 400));
    }

    // 2) Check if user exists && password is correct
    const user = await UserModel.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('Incorrect email or password', 401));
    }

    // 3) Check if selected role is valid for this user
    if (selectedRole && !user.roles.includes(selectedRole)) {
      return next(new AppError('Invalid role selected', 400));
    }

    // 4) Update selected role if provided
    if (selectedRole) {
      user.selectedRole = selectedRole;
      await user.save({ validateBeforeSave: false });
    }

    // 5) If everything ok, send token
    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};

export const switchRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { role } = req.body;

    if (!role) {
      return next(new AppError('Please provide a role', 400));
    }

    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    // 1) Get user from collection
    const user = await UserModel.findById(req.user._id);

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // 2) Check if user has the requested role
    if (!user.roles.includes(role)) {
      return next(new AppError('Invalid role selected', 400));
    }

    user.selectedRole = role;
    await user.save({ validateBeforeSave: false });

    // If switching to student role, ensure student record exists
    if (role === 'student') {
      await syncStudentUser(user);
    }

    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};
