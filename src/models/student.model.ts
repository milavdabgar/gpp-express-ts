import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A student must be associated with a user']
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'A student must be associated with a department']
  },
  rollNo: {
    type: String,
    required: [true, 'Roll number is required'],
    unique: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: 1,
    max: 8
  },
  batch: {
    type: String,
    required: [true, 'Batch year is required']
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  joiningDate: {
    type: Date,
    required: [true, 'Joining date is required']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

export const StudentModel = mongoose.model('Student', studentSchema);
