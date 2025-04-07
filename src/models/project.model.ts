import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  title: string;
  category: string;
  abstract: string;
  department: mongoose.Types.ObjectId;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed';
  requirements: {
    power: boolean;
    internet: boolean;
    specialSpace: boolean;
    otherRequirements: string;
  };
  guide: {
    userId: mongoose.Types.ObjectId;
    name: string;
    department: mongoose.Types.ObjectId;
    contactNumber: string;
  };
  teamId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  locationId?: mongoose.Types.ObjectId;
  deptEvaluation?: {
    completed: boolean;
    score: number;
    feedback: string;
    juryId: mongoose.Types.ObjectId;
    evaluatedAt: Date;
  };
  centralEvaluation?: {
    completed: boolean;
    score: number;
    feedback: string;
    juryId: mongoose.Types.ObjectId;
    evaluatedAt: Date;
  };
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Project title is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Project category is required'],
      trim: true,
    },
    abstract: {
      type: String,
      required: [true, 'Project abstract is required'],
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected', 'completed'],
      default: 'draft',
    },
    requirements: {
      power: {
        type: Boolean,
        default: false,
      },
      internet: {
        type: Boolean,
        default: false,
      },
      specialSpace: {
        type: Boolean,
        default: false,
      },
      otherRequirements: {
        type: String,
        default: '',
      },
    },
    guide: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Guide user ID is required'],
      },
      name: {
        type: String,
        required: [true, 'Guide name is required'],
      },
      department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: [true, 'Guide department is required'],
      },
      contactNumber: {
        type: String,
        required: [true, 'Guide contact number is required'],
      },
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectTeam',
      required: [true, 'Team ID is required'],
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectEvent',
      required: [true, 'Event ID is required'],
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectLocation',
    },
    deptEvaluation: {
      completed: {
        type: Boolean,
        default: false,
      },
      score: {
        type: Number,
        min: 0,
        max: 100,
      },
      feedback: {
        type: String,
      },
      juryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      evaluatedAt: {
        type: Date,
      },
    },
    centralEvaluation: {
      completed: {
        type: Boolean,
        default: false,
      },
      score: {
        type: Number,
        min: 0,
        max: 100,
      },
      feedback: {
        type: String,
      },
      juryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      evaluatedAt: {
        type: Date,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create indexes for common queries
projectSchema.index({ department: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ eventId: 1 });
projectSchema.index({ 'deptEvaluation.completed': 1 });
projectSchema.index({ 'centralEvaluation.completed': 1 });

export const ProjectModel = mongoose.model<IProject>('Project', projectSchema);
