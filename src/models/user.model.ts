import mongoose, { Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  _id: string;
  name: string;
  email: string;
  password: string;
  department?: mongoose.Types.ObjectId;
  roles: string[];
  selectedRole?: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Please provide your name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 8,
      select: false,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: false,
    },
    roles: {
      type: [String],
      enum: ['student', 'faculty', 'hod', 'principal', 'admin', 'jury'],
      default: ['student'],
    },
    selectedRole: {
      type: String,
      enum: ['student', 'faculty', 'hod', 'principal', 'admin', 'jury'],
      required: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) return next();
    
    // Generate salt and hash password in parallel
    const SALT_ROUNDS = 10;
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Set selected role if not set
userSchema.pre('save', function (next) {
  if (!this.selectedRole && this.roles.length > 0) {
    this.selectedRole = this.roles[0];
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const UserModel: Model<IUser> = mongoose.model<IUser>('User', userSchema);
