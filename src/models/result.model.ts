import mongoose, { Document, Schema } from 'mongoose';

export interface IResult extends Document {
  st_id: string;
  extype: string;
  examid: number;
  exam: string;
  declarationDate: Date;
  academicYear: string;
  semester: number;
  mapNumber: number;
  unitNo: number;
  examNumber: number;
  name: string;
  instcode: number;
  instName: string;
  courseName: string;
  branchCode: number;
  branchName: string;
  subjects: Array<{
    code: string;
    name: string;
    credits: number;
    grade: string;
    isBacklog: boolean;
  }>;
  totalCredits: number;
  earnedCredits: number;
  spi: number;
  cpi: number;
  cgpa: number;
  result: string;
  trials: number;
  remark: string;
  createdAt: Date;
  updatedAt: Date;
  uploadBatch: string; // To group uploads done in one batch
}

const resultSchema = new Schema({
  st_id: {
    type: String,
    required: true,
    index: true
  },
  extype: {
    type: String
  },
  examid: {
    type: Number
  },
  exam: {
    type: String
  },
  declarationDate: {
    type: Date
  },
  academicYear: {
    type: String
  },
  semester: {
    type: Number,
    required: true
  },
  mapNumber: {
    type: Number
  },
  unitNo: {
    type: Number
  },
  examNumber: {
    type: Number
  },
  name: {
    type: String,
    required: true
  },
  instcode: {
    type: Number
  },
  instName: {
    type: String
  },
  courseName: {
    type: String
  },
  branchCode: {
    type: Number
  },
  branchName: {
    type: String,
    required: true
  },
  subjects: [{
    code: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    credits: {
      type: Number,
      default: 0
    },
    grade: {
      type: String
    },
    isBacklog: {
      type: Boolean,
      default: false
    }
  }],
  totalCredits: {
    type: Number
  },
  earnedCredits: {
    type: Number
  },
  spi: {
    type: Number
  },
  cpi: {
    type: Number
  },
  cgpa: {
    type: Number
  },
  result: {
    type: String
  },
  trials: {
    type: Number,
    default: 1
  },
  remark: {
    type: String
  },
  uploadBatch: {
    type: String
  }
}, {
  timestamps: true
});

// Create compound index on student ID and exam ID to ensure uniqueness
resultSchema.index({ st_id: 1, examid: 1 }, { unique: true });

// Create indexes for common query patterns
resultSchema.index({ branchName: 1, semester: 1 });
resultSchema.index({ academicYear: 1 });
resultSchema.index({ uploadBatch: 1 });

export const ResultModel = mongoose.model<IResult>('Result', resultSchema);
