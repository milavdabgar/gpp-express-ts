import mongoose, { Document, Schema } from 'mongoose';

interface TeamMember {
  userId: mongoose.Types.ObjectId;
  name: string;
  enrollmentNo: string;
  role: string;
  isLeader: boolean;
}

export interface IProjectTeam extends Document {
  name: string;
  department: mongoose.Types.ObjectId;
  members: TeamMember[];
  eventId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const projectTeamSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: [true, 'User ID is required'],
        },
        name: {
          type: String,
          required: [true, 'Member name is required'],
        },
        enrollmentNo: {
          type: String,
          required: [true, 'Enrollment number is required'],
        },
        role: {
          type: String,
          default: 'Member',
        },
        isLeader: {
          type: Boolean,
          default: false,
        },
      },
    ],
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectEvent',
      required: [true, 'Event ID is required'],
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
projectTeamSchema.index({ department: 1 });
projectTeamSchema.index({ eventId: 1 });
projectTeamSchema.index({ 'members.userId': 1 });

// Virtual for accessing associated projects
projectTeamSchema.virtual('projects', {
  ref: 'Project',
  localField: '_id',
  foreignField: 'teamId',
  justOne: false,
});

// Ensure at least one team member and one leader
projectTeamSchema.pre('save', function (next) {
  if (this.members.length === 0) {
    const err = new Error('Team must have at least one member');
    return next(err);
  }

  const leaders = this.members.filter(member => member.isLeader);
  if (leaders.length === 0) {
    const err = new Error('Team must have at least one leader');
    return next(err);
  }

  if (leaders.length > 1) {
    const err = new Error('Team can have only one leader');
    return next(err);
  }

  next();
});

export const ProjectTeamModel = mongoose.model<IProjectTeam>('ProjectTeam', projectTeamSchema);
