import mongoose, { Document, Schema } from 'mongoose';

export interface IProjectLocation extends Document {
  locationId: string; // Example: A-12, B-08
  section: string; // A, B, C, etc.
  position: number; // 12, 08, etc.
  department: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  isAssigned: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const projectLocationSchema = new Schema(
  {
    locationId: {
      type: String,
      required: [true, 'Location ID is required'],
      unique: true,
      trim: true,
    },
    section: {
      type: String,
      required: [true, 'Section is required'],
      trim: true,
    },
    position: {
      type: Number,
      required: [true, 'Position is required'],
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectEvent',
      required: [true, 'Event ID is required'],
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    isAssigned: {
      type: Boolean,
      default: false,
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
projectLocationSchema.index({ section: 1, position: 1 });
projectLocationSchema.index({ department: 1 });
projectLocationSchema.index({ eventId: 1 });
projectLocationSchema.index({ isAssigned: 1 });

// Virtual for accessing the associated project
projectLocationSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

export const ProjectLocationModel = mongoose.model<IProjectLocation>('ProjectLocation', projectLocationSchema);
