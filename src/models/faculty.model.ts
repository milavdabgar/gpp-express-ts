import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IFaculty extends Document {
  userId: mongoose.Types.ObjectId;
  employeeId: string;
  departmentId: mongoose.Types.ObjectId;
  designation: string;
  specializations: string[];
  qualifications: {
    degree: string;
    field: string;
    institution: string;
    year: number;
  }[];
  joiningDate: Date;
  status: 'active' | 'inactive';
  experience: number;
  createdAt: Date;
  updatedAt: Date;
}

const facultySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  employeeId: {
    type: String,
    required: true,
    unique: true
  },
  departmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  designation: {
    type: String,
    required: true
  },
  specializations: [{
    type: String,
    required: true
  }],
  qualifications: [{
    degree: {
      type: String,
      required: true
    },
    field: {
      type: String,
      required: true
    },
    institution: {
      type: String,
      required: true
    },
    year: {
      type: Number,
      required: true
    }
  }],
  joiningDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  experience: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

export const FacultyModel: Model<IFaculty> = mongoose.model<IFaculty>('Faculty', facultySchema);
