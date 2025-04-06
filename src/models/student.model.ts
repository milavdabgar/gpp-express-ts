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
  enrollmentNo: {
    type: String,
    sparse: true,
    unique: true
  },
  batch: {
    type: String,
    default: ''
  },
  semester: {
    type: Number,
    default: 1,
    min: 1,
    max: 8
  },
  admissionDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'graduated', 'transferred', 'dropped'],
    default: 'active'
  },
  guardian: {
    name: {
      type: String,
      default: ''
    },
    relation: {
      type: String,
      default: ''
    },
    contact: {
      type: String,
      default: ''
    },
    occupation: {
      type: String,
      default: ''
    }
  },
  contact: {
    mobile: {
      type: String,
      default: ''
    },
    email: {
      type: String,
      default: ''
    },
    address: {
      type: String,
      default: ''
    },
    city: {
      type: String,
      default: ''
    },
    state: {
      type: String,
      default: ''
    },
    pincode: {
      type: String,
      default: ''
    }
  },
  educationBackground: [{
    degree: {
      type: String,
      required: true
    },
    institution: {
      type: String,
      required: true
    },
    board: {
      type: String,
      required: true
    },
    percentage: {
      type: Number,
      required: true
    },
    yearOfPassing: {
      type: Number,
      required: true
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

export const StudentModel = mongoose.model('Student', studentSchema);