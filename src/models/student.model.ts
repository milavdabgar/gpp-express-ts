import mongoose, { Schema } from 'mongoose';

export interface Student {
  id: number;
  enrollmentNo: string;
  firstName: string;
  middleName: string;
  lastName: string;
  personalEmail: string;
  institutionalEmail: string;
  departmentCode: string;
  admissionYear: number;
  currentSemester: number;
  semesterStatus: {
    sem1: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
    sem2: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
    sem3: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
    sem4: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
    sem5: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
    sem6: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
    sem7: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
    sem8: 'CLEARED' | 'PENDING' | 'NOT_ATTEMPTED';
  };
}

const StudentSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  departmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Department'
  },
  firstName: { type: String },
  middleName: { type: String },
  lastName: { type: String },
  fullName: { type: String },
  enrollmentNo: {
    type: String,
    required: true,
    unique: true
  },
  personalEmail: {
    type: String,
    sparse: true,
    trim: true
  },
  institutionalEmail: {
    type: String,
    required: true,
    unique: true,
    trim: true
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
  semesterStatus: {
    sem1: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    },
    sem2: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    },
    sem3: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    },
    sem4: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    },
    sem5: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    },
    sem6: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    },
    sem7: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    },
    sem8: {
      type: String,
      enum: ['CLEARED', 'PENDING', 'NOT_ATTEMPTED'],
      default: 'NOT_ATTEMPTED'
    }
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
  }],
  gender: {
    type: String,
    enum: {
      values: ['M', 'F', 'O', 'NB', 'P'],
      message: 'Gender must be one of: M (Male), F (Female), O (Other), NB (Non-Binary), P (Prefer not to say)'
    },
    trim: true,
    set: function(value: string) {
      return value ? value.toUpperCase() : value;
    }
  },
  category: {
    type: String,
    enum: ['OPEN', 'SC', 'ST', 'SEBC', 'EWS', 'TFWS'],
    trim: true
  },
  aadharNo: {
    type: String,
    trim: true,
    sparse: true
  },
  admissionYear: {
    type: Number,
    required: true
  },
  convoYear: {
    type: Number
  },
  isComplete: {
    type: Boolean,
    default: false
  },
  termClose: {
    type: Boolean,
    default: false
  },
  isCancel: {
    type: Boolean,
    default: false
  },
  isPassAll: {
    type: Boolean,
    default: false
  },
  shift: {
    type: Number,
    enum: [1, 2],
    default: 1
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

export const StudentModel = mongoose.model('Student', StudentSchema);