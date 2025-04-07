import mongoose, { Document, Schema } from 'mongoose';

interface ScheduleItem {
  time: string;
  activity: string;
  location: string;
  coordinator: {
    userId: mongoose.Types.ObjectId;
    name: string;
  };
  notes: string;
}

export interface IProjectEvent extends Document {
  name: string;
  description: string;
  academicYear: string;
  eventDate: Date;
  registrationStartDate: Date;
  registrationEndDate: Date;
  isActive: boolean;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  publishResults: boolean;
  schedule: ScheduleItem[];
  departments: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const projectEventSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Event name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Event description is required'],
    },
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      trim: true,
    },
    eventDate: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    registrationStartDate: {
      type: Date,
      required: [true, 'Registration start date is required'],
    },
    registrationEndDate: {
      type: Date,
      required: [true, 'Registration end date is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
      default: 'upcoming',
    },
    publishResults: {
      type: Boolean,
      default: false,
    },
    schedule: [
      {
        time: {
          type: String,
          required: true,
        },
        activity: {
          type: String,
          required: true,
        },
        location: {
          type: String,
          required: true,
        },
        coordinator: {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          name: {
            type: String,
            required: true,
          },
        },
        notes: {
          type: String,
          default: '',
        },
      },
    ],
    departments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
      },
    ],
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
projectEventSchema.index({ isActive: 1 });
projectEventSchema.index({ status: 1 });
projectEventSchema.index({ academicYear: 1 });
projectEventSchema.index({ eventDate: 1 });
projectEventSchema.index({ registrationStartDate: 1, registrationEndDate: 1 });

// Virtual for accessing associated projects
projectEventSchema.virtual('projects', {
  ref: 'Project',
  localField: '_id',
  foreignField: 'eventId',
  justOne: false,
});

// Automatically update status based on dates
projectEventSchema.pre('save', function (next) {
  const currentDate = new Date();
  const eventDate = this.eventDate;
  const regStartDate = this.registrationStartDate;
  const regEndDate = this.registrationEndDate;

  if (!this.isActive) {
    this.status = 'cancelled';
  } else if (currentDate > eventDate) {
    this.status = 'completed';
  } else if (currentDate >= regStartDate && currentDate <= regEndDate) {
    this.status = 'ongoing';
  } else {
    this.status = 'upcoming';
  }

  next();
});

export const ProjectEventModel = mongoose.model<IProjectEvent>('ProjectEvent', projectEventSchema);
